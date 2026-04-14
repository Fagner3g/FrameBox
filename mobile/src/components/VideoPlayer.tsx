import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Pressable,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme/colors';

const HLS_JS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';

interface VideoPlayerProps {
  streamUrl: string;
  isLive?: boolean;
  hlsJsUrl?: string;
  webrtcUrl?: string;
  authToken?: string;
}

const MAX_AUTO_RETRIES = 5;
const AUTO_RETRY_DELAY_MS = 4000;

// Note: signaling fetch is done from React Native (not WebView) to avoid Android
// WebView cleartext-HTTP restrictions on null-origin inline HTML pages.
// The WebView generates the SDP offer and posts it via postMessage('sdp-offer:<sdp>').
// React Native fetches the signaling URL, then injects the SDP answer back via
// injectJavaScript('rnSetRemoteDescription("<answer>")').
function buildWebRtcHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:100%; height:100%; background:#000; overflow:hidden; }
    video { width:100%; height:100%; object-fit:contain; background:#000; display:block; }
  </style>
</head>
<body>
  <video id="v" autoplay playsinline></video>
  <script>
    var rn = window.ReactNativeWebView;
    var pc;
    function post(msg) { if (rn) rn.postMessage(msg); }
    function log(msg)  { post('log:' + msg); }

    function initPc() {
      pc = new RTCPeerConnection({
        iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
      });

      pc.ontrack = function(e) {
        log('ontrack — streams=' + e.streams.length);
        var v = document.getElementById('v');
        v.srcObject = e.streams[0];
        v.play().catch(function(err){ log('play err: ' + err); });
      };

      pc.onicecandidate = function(e) {
        if (e.candidate) log('ice: ' + e.candidate.type + ' ' + (e.candidate.address||''));
      };

      pc.onconnectionstatechange = function() {
        log('connState: ' + pc.connectionState);
        if (pc.connectionState === 'connected') post('playing');
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') post('error:webrtc ' + pc.connectionState);
      };

      pc.addTransceiver('video', {direction: 'recvonly'});
      pc.addTransceiver('audio', {direction: 'recvonly'});
      log('transceivers added — creating offer...');

      pc.createOffer()
        .then(function(offer) {
          return pc.setLocalDescription(offer);
        })
        .then(function() {
          log('local desc set — waiting ICE (state=' + pc.iceGatheringState + ')...');
          return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') { resolve(); return; }
            pc.onicegatheringstatechange = function() {
              if (pc.iceGatheringState === 'complete') resolve();
            };
            setTimeout(function() { log('ice gather timeout — proceeding'); resolve(); }, 2000);
          });
        })
        .then(function() {
          log('offer ready — asking RN to signal...');
          post('sdp-offer:' + pc.localDescription.sdp);
        })
        .catch(function(e) {
          log('offer error: ' + e.message);
          post('error:' + e.message);
        });
    }

    // Called by React Native via injectJavaScript after signaling succeeds
    function rnSetRemoteDescription(sdp) {
      log('RN delivered SDP answer (' + sdp.length + ' chars)');
      pc.setRemoteDescription({type: 'answer', sdp: sdp})
        .then(function() { log('remote desc set — waiting ICE connection...'); })
        .catch(function(e) { log('setRemoteDesc err: ' + e.message); post('error:' + e.message); });
    }

    initPc();
  </script>
</body>
</html>`;
}

function buildHtml(url: string, controls: boolean, hlsJsUrl: string): string {
  // Escape single quotes in URL to avoid JS injection
  const safeUrl    = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeHlsUrl = hlsJsUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:100%; height:100%; background:#000; overflow:hidden; }
    video { width:100%; height:100%; object-fit:contain; background:#000; display:block; }
  </style>
</head>
<body>
  <video id="v" ${controls ? 'controls' : ''} autoplay playsinline></video>
  <script>
    var v = document.getElementById('v');
    var src = '${safeUrl}';
    var rn = window.ReactNativeWebView;

    function post(msg) { if (rn) rn.postMessage(msg); }

    v.addEventListener('playing', function() { post('playing'); });
    v.addEventListener('waiting',  function() { post('buffering'); });
    v.addEventListener('stalled',  function() { post('buffering'); });

    function loadHlsJs() {
      var s = document.createElement('script');
      s.src = '${safeHlsUrl}';
      s.onerror = function() { post('error:hls.js load failed'); };
      s.onload = function() {
        if (!window.Hls || !Hls.isSupported()) { post('error:hls.js not supported'); return; }
        var hls = new Hls({ enableWorker: false, maxBufferLength: 10 });
        hls.loadSource(src);
        hls.attachMedia(v);
        hls.on(Hls.Events.ERROR, function(_e, d) {
          if (d.fatal) post('error:' + d.type);
        });
        v.play().catch(function(){});
      };
      document.head.appendChild(s);
    }

    // Try native HLS first (iOS WKWebView, modern Android WebView/Chrome 107+)
    if (v.canPlayType('application/vnd.apple.mpegurl') ||
        v.canPlayType('application/x-mpegurl')) {
      v.src = src;
      v.addEventListener('error', function() { loadHlsJs(); });
      v.play().catch(function(){});
    } else {
      loadHlsJs();
    }
  </script>
</body>
</html>`;
}

export default function VideoPlayer({ streamUrl, isLive = true, hlsJsUrl = HLS_JS_CDN, webrtcUrl, authToken }: VideoPlayerProps) {
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError]             = useState(false);
  const [webKey, setWebKey]           = useState(0);
  const [debugLog, setDebugLog]       = useState<string[]>([]);
  const autoRetryCount                = useRef(0);
  const retryTimer                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webviewRef                    = useRef<WebView>(null);

  // Reset when stream URL changes
  useEffect(() => {
    autoRetryCount.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setError(false);
    setIsBuffering(true);
    setWebKey(k => k + 1);
  }, [streamUrl]);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const scheduleAutoRetry = () => {
    if (isLive && autoRetryCount.current < MAX_AUTO_RETRIES) {
      autoRetryCount.current += 1;
      retryTimer.current = setTimeout(() => {
        setError(false);
        setIsBuffering(true);
        setWebKey(k => k + 1);
      }, AUTO_RETRY_DELAY_MS);
    } else {
      setError(true);
    }
  };

  const handleRetry = () => {
    autoRetryCount.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setError(false);
    setIsBuffering(true);
    setWebKey(k => k + 1);
  };

  const onMessage = (event: any) => {
    const msg: string = event.nativeEvent.data;

    if (msg.startsWith('log:')) {
      const line = msg.slice(4);
      console.log('[VP-WebView]', line);
      setDebugLog(prev => [...prev.slice(-6), line]);
      return;
    }

    // SDP offer from WebView — do signaling from RN network stack (avoids Android WebView HTTP restrictions)
    if (msg.startsWith('sdp-offer:')) {
      const sdpOffer = msg.slice('sdp-offer:'.length);
      console.log('[VP-signaling] Received SDP offer from WebView, forwarding via RN fetch...');
      const headers: Record<string, string> = {
        'Content-Type': 'application/sdp',
      };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      fetch(webrtcUrl!, { method: 'POST', body: sdpOffer, headers })
        .then(r => {
          console.log('[VP-signaling] Response:', r.status, r.statusText);
          if (!r.ok) {
            return r.text().then(body => {
              throw new Error(`HTTP ${r.status} — ${body.trim().slice(0, 120)}`);
            });
          }
          return r.text();
        })
        .then(sdpAnswer => {
          console.log('[VP-signaling] SDP answer received, injecting into WebView...');
          const escaped = sdpAnswer.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
          webviewRef.current?.injectJavaScript(`rnSetRemoteDescription(\`${escaped}\`);true;`);
        })
        .catch(e => {
          console.warn('[VP-signaling] Signaling failed:', e.message);
          webviewRef.current?.injectJavaScript(`post('error:signaling ${e.message}');true;`);
        });
      return;
    }

    console.log('[VP-state]', msg);

    if (msg === 'playing') {
      autoRetryCount.current = 0;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      setIsBuffering(false);
      setError(false);
    } else if (msg === 'buffering') {
      setIsBuffering(true);
    } else if (msg.startsWith('error:')) {
      console.warn('[VideoPlayer] ERROR:', msg);
      setIsBuffering(false);
      scheduleAutoRetry();
    }
  };

  const html = webrtcUrl
    ? buildWebRtcHtml()
    : buildHtml(streamUrl, !isLive, hlsJsUrl);

  return (
    <View style={styles.container}>
      {!error && (
        <WebView
          ref={webviewRef}
          key={webKey}
          source={{ html }}
          style={styles.webview}
          // Allow inline media with audio autoplay
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          // Needed for HLS.js CDN fallback
          mixedContentMode="always"
          onMessage={onMessage}
          onError={() => scheduleAutoRetry()}
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          // Transparent background so container black shows through before load
          backgroundColor="#000000"
        />
      )}

      {isBuffering && !error && (
        <View style={StyleSheet.absoluteFillObject as any} pointerEvents="none">
          <View style={styles.overlayInner}>
            <ActivityIndicator size="large" color={colors.primary} />
            {isLive && (
              <Text style={styles.bufferingText}>
                {autoRetryCount.current > 0
                  ? `Aguardando stream... (${autoRetryCount.current}/${MAX_AUTO_RETRIES})`
                  : 'Conectando ao stream...'}
              </Text>
            )}
          </View>
        </View>
      )}

      {error && (
        <View style={[StyleSheet.absoluteFillObject as any, styles.errorOverlay]}>
          <Text style={styles.errorText}>Sinal indisponível</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </Pressable>
        </View>
      )}

      {isLive && !error && !isBuffering && (
        <View style={styles.liveBadge} pointerEvents="none">
          <View style={styles.recDot} />
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
      )}


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 250,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlayInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bufferingText: {
    color: colors.textLight,
    fontSize: 13,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  errorOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorText: {
    color: colors.danger,
    fontWeight: 'bold',
    fontSize: 16,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  retryText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  liveBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  liveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  debugOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 4,
  },
  debugLine: {
    color: '#0f0',
    fontSize: 9,
    fontFamily: 'monospace',
    lineHeight: 12,
  },
});
