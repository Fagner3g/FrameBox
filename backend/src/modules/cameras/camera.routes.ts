import { Router } from "express";
import { CameraController } from "./camera.controller";

const router = Router();

router.get("/", CameraController.list);
router.post("/", CameraController.create);
router.get("/:id", CameraController.get);
router.put("/:id", CameraController.update);
router.delete("/:id", CameraController.delete);
router.post("/:id/start", CameraController.startRecording);
router.post("/:id/stop", CameraController.stopRecording);
router.get("/:id/snapshot", CameraController.snapshot);

export default router;
