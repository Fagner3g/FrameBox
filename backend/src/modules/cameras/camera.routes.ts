import { Router } from "express";
import express from "express";
import { CameraController } from "./camera.controller";

const router = Router();

router.get("/", CameraController.list);
router.get("/protocols", CameraController.listProtocols);
router.get("/scan", CameraController.scan);
router.post("/:id/webrtc", express.text({ type: "*/*" }), CameraController.webrtcSignal);
router.post("/test-connection", CameraController.testConnection);
router.post("/", CameraController.create);
router.get("/:id", CameraController.get);
router.put("/:id", CameraController.update);
router.delete("/:id", CameraController.delete);
router.post("/:id/start", CameraController.startRecording);
router.post("/:id/stop", CameraController.stopRecording);
router.get("/:id/snapshot", CameraController.snapshot);

export default router;
