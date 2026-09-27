import React, { useEffect, useRef, useState } from "react";

const cropSize = 420;

export function StudentPhoto({ file, onChange }) {
  const videoRef = useRef(null),
    streamRef = useRef(null),
    cropCanvasRef = useRef(null),
    capturedImageRef = useRef(null);
  const [camera, setCamera] = useState(false),
    [capturedUrl, setCapturedUrl] = useState(""),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1),
    [offsetX, setOffsetX] = useState(0),
    [offsetY, setOffsetY] = useState(0),
    [saving, setSaving] = useState(false);
  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera(false);
  };
  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (camera && videoRef.current)
      videoRef.current.srcObject = streamRef.current;
  }, [camera]);
  const start = async () => {
    setError("");
    setCapturedUrl("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera unavailable");
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      setCamera(true);
    } catch {
      setError(
        "Camera access is unavailable. Check browser permission or upload a picture instead.",
      );
    }
  };
  const takeShot = () => {
    const video = videoRef.current;
    if (!video?.videoWidth)
      return setError("The camera is still starting. Please try again.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setCapturedUrl(canvas.toDataURL("image/jpeg", 0.94));
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    stop();
  };
  useEffect(() => {
    if (!capturedUrl) return;
    const image = new Image();
    capturedImageRef.current = image;
    image.onload = () => requestAnimationFrame(drawCrop);
    image.src = capturedUrl;
  }, [capturedUrl]);
  useEffect(() => {
    drawCrop();
  }, [zoom, offsetX, offsetY]);
  function drawCrop() {
    const image = capturedImageRef.current,
      canvas = cropCanvasRef.current;
    if (!image?.complete || !canvas) return;
    const ctx = canvas.getContext("2d"),
      base = Math.max(
        cropSize / image.naturalWidth,
        cropSize / image.naturalHeight,
      ),
      scale = base * zoom,
      width = image.naturalWidth * scale,
      height = image.naturalHeight * scale,
      maxX = Math.max(0, (width - cropSize) / 2),
      maxY = Math.max(0, (height - cropSize) / 2),
      x = (cropSize - width) / 2 + (offsetX / 100) * maxX,
      y = (cropSize - height) / 2 + (offsetY / 100) * maxY;
    ctx.clearRect(0, 0, cropSize, cropSize);
    ctx.drawImage(image, x, y, width, height);
  }
  const saveCrop = () => {
    setSaving(true);
    cropCanvasRef.current?.toBlob(
      (blob) => {
        setSaving(false);
        if (!blob) return setError("The cropped picture could not be saved.");
        onChange(
          new File([blob], `student-${Date.now()}.jpg`, { type: "image/jpeg" }),
        );
        setCapturedUrl("");
      },
      "image/jpeg",
      0.9,
    );
  };
  const retake = () => {
    setCapturedUrl("");
    start();
  };
  const preview = file ? URL.createObjectURL(file) : null;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <div className="photo-picker">
      <div
        className={
          "photo-preview " +
          (camera ? "camera-live" : capturedUrl ? "crop-preview" : "")
        }
      >
        {camera ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : capturedUrl ? (
          <canvas
            ref={(canvas) => {
              cropCanvasRef.current = canvas;
              if (canvas) requestAnimationFrame(drawCrop);
            }}
            width={cropSize}
            height={cropSize}
            aria-label="Cropped student photo preview"
          />
        ) : preview ? (
          <img src={preview} alt="Student profile preview" />
        ) : (
          <span>♙</span>
        )}
      </div>
      {capturedUrl && (
        <section className="photo-crop-tools" aria-label="Photo crop tools">
          <strong>Crop the profile picture</strong>
          <p>Adjust the zoom and position, then save the picture.</p>
          <label>
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <label>
            Horizontal position
            <input
              type="range"
              min="-100"
              max="100"
              value={offsetX}
              onChange={(event) => setOffsetX(Number(event.target.value))}
            />
          </label>
          <label>
            Vertical position
            <input
              type="range"
              min="-100"
              max="100"
              value={offsetY}
              onChange={(event) => setOffsetY(Number(event.target.value))}
            />
          </label>
          <div className="photo-actions">
            <button type="button" className="secondary" onClick={retake}>
              Retake
            </button>
            <button type="button" disabled={saving} onClick={saveCrop}>
              {saving ? "Saving…" : "Save cropped picture"}
            </button>
          </div>
        </section>
      )}
      {!capturedUrl && (
        <div className="photo-actions">
          <label className="button-link secondary">
            Upload image
            <input
              className="visually-hidden"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => onChange(event.target.files?.[0] || null)}
            />
          </label>
          {camera ? (
            <>
              <button type="button" onClick={takeShot}>
                Take photo
              </button>
              <button type="button" className="text-button" onClick={stop}>
                Cancel camera
              </button>
            </>
          ) : (
            <button type="button" className="secondary" onClick={start}>
              Use webcam
            </button>
          )}
          {file && !camera && (
            <button
              type="button"
              className="text-button"
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          )}
        </div>
      )}
      {camera && (
        <small className="camera-status">
          <span className="dot" /> Camera live — position the student, then take
          the photo.
        </small>
      )}
      {error && <small className="error-inline">{error}</small>}
    </div>
  );
}
