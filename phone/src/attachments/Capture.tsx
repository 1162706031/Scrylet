import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import type Cropper from "cropperjs";
import type { PublicStatus } from "../../../contracts/index.js";
import type { Composer } from "../chat/useComposer";
import { ApiError, json, messageOf, remember, stored, schemas } from "../api";
import { canvasBlob, rasterImage, uploadImage } from "./images";
type Capture = {
  displayId: string;
  width: number;
  height: number;
  image: string;
};
type RememberedCrop = {
  width?: number;
  height?: number;
  data?: Partial<Cropper.Data>;
};
function captureValue(value: unknown): Capture {
  const parsed = schemas.capture.safeParse(value);
  if (!parsed.success) throw new ApiError("PROTOCOL_MISMATCH", "截图数据无效");
  return parsed.data;
}
export function CaptureControls({
  composer,
  status,
  disabled,
  notify,
}: {
  composer: Composer;
  status: PublicStatus | null;
  disabled: boolean;
  notify(message: string): void;
}): React.JSX.Element {
  const [display, setDisplay] = useState(stored("snap.display") || ""),
    [capture, setCapture] = useState<Capture | null>(null),
    [pending, setPending] = useState(false);
  const context = useRef(composer.context()),
    alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  useEffect(() => {
    if (
      status?.displays.length &&
      !status.displays.some((d) => d.id === display)
    )
      setDisplay(
        status.displays.find((d) => d.primary)?.id ||
          status.displays[0]?.id ||
          "",
      );
  }, [status?.displays, display]);
  const take = async (crop: boolean, selected = display): Promise<void> => {
    const current = composer.context();
    setPending(true);
    try {
      await composer.process(async () => {
        const result = captureValue(
          await json("/snap/api/capture", { displayId: selected }),
        );
        composer.assert({ epoch: current.epoch });
        remember("snap.display", result.displayId);
        if (!alive.current) return [];
        setDisplay(result.displayId);
        if (crop) {
          context.current = current;
          setCapture(result);
          return [];
        }
        return [
          await uploadImage(await canvasBlob(await rasterImage(result.image))),
        ];
      }, current);
    } catch (error) {
      if (alive.current) notify(messageOf(error));
    } finally {
      if (alive.current) setPending(false);
    }
  };
  const blocked = disabled || pending || status?.permission !== "granted";
  return (
    <>
      <button
        id="snap-capture"
        disabled={blocked}
        onClick={() => void take(false)}
      >
        <Icon name="capture" size={17} />截屏
      </button>
      <button id="snap-crop" disabled={blocked} onClick={() => void take(true)}>
        <Icon name="crop" size={17} />框选
      </button>
      {(status?.displays.length || 0) > 1 && (
        <select
          aria-label="选择截屏屏幕"
          value={display}
          disabled={disabled || pending}
          onChange={(e) => {
            setDisplay(e.target.value);
            remember("snap.display", e.target.value);
          }}
        >
          {status?.displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.primary ? " · 主屏" : ""}
            </option>
          ))}
        </select>
      )}
      {capture && (
        <CropDialog
          key={capture.image}
          capture={capture}
          busy={pending}
          close={() => setCapture(null)}
          displays={status?.displays || []}
          retake={(selected) => void take(true, selected)}
          attach={async (canvas) => {
            composer.assert({ epoch: context.current.epoch });
            setPending(true);
            try {
              await composer.process(
                async () => [await uploadImage(await canvasBlob(canvas))],
                context.current,
              );
              setCapture(null);
            } finally {
              setPending(false);
            }
          }}
          notify={notify}
        />
      )}
    </>
  );
}
function CropDialog({
  capture,
  busy,
  displays,
  close,
  retake,
  attach,
  notify,
}: {
  capture: Capture;
  busy: boolean;
  displays: PublicStatus["displays"];
  close(): void;
  retake(id: string): void;
  attach(canvas: HTMLCanvasElement): Promise<void>;
  notify(message: string): void;
}): React.JSX.Element {
  const image = useRef<HTMLImageElement>(null),
    cropper = useRef<Cropper | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      import("cropperjs"),
      import("cropperjs/dist/cropper.css"),
    ])
      .then(([module]) => {
        if (!active || !image.current) return;
        let remembered: RememberedCrop | null = null;
        try {
          remembered = JSON.parse(
            stored("snap.crop." + capture.displayId) || "null",
          ) as RememberedCrop | null;
        } catch {
          /* Optional coordinates. */
        }
        const instance = new module.default(image.current, {
          viewMode: 1,
          dragMode: "move",
          autoCropArea: 0.8,
          background: false,
          responsive: true,
          checkOrientation: false,
          ready() {
            if (!active) return;
            if (
              remembered?.width === capture.width &&
              remembered.height === capture.height &&
              remembered.data
            )
              instance.setData(remembered.data);
            setReady(true);
          },
        });
        cropper.current = instance;
      })
      .catch((error) => notify(messageOf(error)));
    return () => {
      active = false;
      cropper.current?.destroy();
      cropper.current = null;
    };
  }, [capture]);
  const add = async (): Promise<void> => {
    const current = cropper.current;
    if (!current || !ready || busy) return;
    const data = current.getData(true);
    if (data.width < 24 || data.height < 24) {
      notify("选区太小，请扩大一些");
      return;
    }
    const canvas = current.getCroppedCanvas({
      maxWidth: 2560,
      maxHeight: 2560,
      fillColor: "#fff",
    });
    try {
      await attach(canvas);
      remember(
        "snap.crop." + capture.displayId,
        JSON.stringify({ width: capture.width, height: capture.height, data }),
      );
    } catch (error) {
      notify(messageOf(error));
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="dialog crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="框选电脑屏幕"
      >
        <header>
          <div>
            <h2>框选问题</h2>
            <small>拖动边角 · 双指缩放</small>
          </div>
          <button onClick={close}>取消框选</button>
        </header>
        <div className="crop-controls">
          <select
            aria-label="选择电脑屏幕"
            value={capture.displayId}
            disabled={busy}
            onChange={(e) => retake(e.target.value)}
          >
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button disabled={busy} onClick={() => retake(capture.displayId)}>
            重新截屏
          </button>
        </div>
        <div className="crop-stage">
          <img
            ref={image}
            src={capture.image}
            alt="电脑截图，拖动裁剪框选择区域"
          />
        </div>
        <footer>
          <button onClick={() => cropper.current?.zoom(-0.15)}>缩小选区</button>
          <button onClick={() => cropper.current?.zoom(0.15)}>放大选区</button>
          <button onClick={() => cropper.current?.reset()}>重置选区</button>
          <button
            id="snap-attach"
            className="send"
            disabled={!ready || busy}
            onClick={() => void add()}
          >
            {busy ? "正在添加…" : "添加选区到对话"}
          </button>
        </footer>
      </section>
    </div>
  );
}
