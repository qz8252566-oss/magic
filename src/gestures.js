import { SPELLS } from "./engine.js";

export const MEDIAPIPE_VERSION = "0.10.18";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class GestureCamera {
  constructor(video, onGesture, onStatus, onPointer = () => {}, onPinch = () => {}) {
    this.video = video;
    this.onGesture = onGesture;
    this.onStatus = onStatus;
    this.onPointer = onPointer;
    this.onPinch = onPinch;
    this.stream = null;
    this.landmarker = null;
    this.running = false;
    this.pendingGesture = null;
    this.pendingSince = 0;
    this.lastEmittedGesture = null;
    this.lastGestureAt = 0;
    this.lastCenter = null;
    this.lastCenterAt = 0;
    this.lastVideoTime = -1;
    this.stopped = false;
    this.pinchSince = 0;
    this.pinchActive = false;
  }

  async start() {
    if (this.running) return;
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("このブラウザーではカメラを使えません。localhost から開いてください。");
    }
    this.onStatus("カメラをじゅんび中…");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 24, max: 30 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    try {
      const vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      this.landmarker = await vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.62,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.55,
      });
      if (this.stopped) {
        this.landmarker.close();
        this.landmarker = null;
        return;
      }
    } catch (error) {
      this.stop();
      throw new Error(`手認識モデルを読み込めませんでした。インターネット接続を確認してください。(${error.message})`);
    }
    this.running = true;
    this.onStatus("カメラOK · 手をうつしてみてね");
    this.detect();
  }

  detect() {
    if (!this.running) return;
    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      const hand = result.landmarks?.[0];
      if (hand) this.classify(hand, performance.now());
      else {
        this.pendingGesture = null;
        this.lastEmittedGesture = null;
        this.lastCenter = null;
        this.pinchSince = 0;
        this.pinchActive = false;
        this.onPointer(null);
        this.onStatus("カメラOK · 手をうつしてみてね");
      }
    }
    this.frame = requestAnimationFrame(() => this.detect());
  }

  classify(hand, now) {
    const wrist = hand[0];
    const handSize = Math.hypot(hand[9].x - wrist.x, hand[9].y - wrist.y);
    const pinching = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y) < handSize * 0.38;
    this.onPointer({ x: 1 - hand[8].x, y: hand[8].y, pinching });
    if (pinching) {
      this.pendingGesture = null;
      this.lastEmittedGesture = null;
      if (!this.pinchSince) this.pinchSince = now;
      if (!this.pinchActive && now - this.pinchSince >= 180) {
        this.pinchActive = true;
        this.onPinch();
      }
      return;
    }
    this.pinchSince = 0;
    this.pinchActive = false;
    const fingerPairs = [[8, 6], [12, 10], [16, 14], [20, 18]];
    const extended = fingerPairs.map(([tip, joint]) => {
      const tipDistance = Math.hypot(hand[tip].x - wrist.x, hand[tip].y - wrist.y);
      const jointDistance = Math.hypot(hand[joint].x - wrist.x, hand[joint].y - wrist.y);
      return tipDistance > jointDistance * 1.16;
    });
    const center = hand[9].x;
    const elapsed = now - this.lastCenterAt;
    const swipe = this.lastCenter !== null && elapsed > 0 && Math.abs(center - this.lastCenter) / elapsed > 0.00062;
    this.lastCenter = center;
    this.lastCenterAt = now;

    const count = extended.filter(Boolean).length;
    const gesture = swipe ? "wind" : count === 4 ? "shield" : count === 2 && extended[0] && extended[1] ? "thunder" : count === 1 && extended[0] ? "fire" : null;
    if (gesture !== this.pendingGesture) {
      this.pendingGesture = gesture;
      this.pendingSince = now;
      if (!gesture) this.lastEmittedGesture = null;
    } else if (gesture && gesture !== this.lastEmittedGesture && now - this.pendingSince >= 220 && now - this.lastGestureAt >= 850) {
      this.lastGestureAt = now;
      this.lastEmittedGesture = gesture;
      this.onGesture(gesture);
      this.onStatus(`${SPELLS[gesture].name}！`);
    } else if (!gesture) {
      this.onStatus("ポーズをまねしてみてね");
    }
  }

  stop() {
    this.stopped = true;
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.classList.remove("active");
    this.onPointer(null);
    this.onStatus("カメラおやすみ中");
  }
}
