import { Router } from "express";
import { RecordingController } from "./recording.controller";

const router = Router();

router.get("/calendar/:cameraId", RecordingController.getCalendar);
router.get("/", RecordingController.list);
router.delete("/:cameraId/:filename", RecordingController.delete);

// Essa URL jogará o arquivo .mp4 para o frontend
router.get("/:cameraId/stream/:filename", RecordingController.stream);

export default router;
