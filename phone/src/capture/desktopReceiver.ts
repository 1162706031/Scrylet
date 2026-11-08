import { useEffect, useRef } from "react";
import type { DesktopPoll, DesktopDelivery } from "../../../contracts/index.js";
import type { Conversation } from "../chat/useConversation";
import { json, response, messageOf, schemas } from "../api";
import { canvasBlob, rasterImage, uploadImage } from "../attachments/images";

export function useDesktopReceiver(
  controller: Conversation,
  clientId: string,
  available: boolean,
): void {
  const ready = useRef(available);
  ready.current = available;
  useEffect(
    () => receiveDesktop(controller, clientId, () => ready.current),
    [controller, clientId],
  );
}
export function receiveDesktop(
  controller: Conversation,
  clientId: string,
  available: () => boolean,
): () => void {
  let alive = true,
    polling = false,
    claim = true,
    lastCommand: string | null = null;
  const composer = controller.composer;
  const pollServer = async (): Promise<unknown> =>
    (
      await response("/snap/api/desktop/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pollValue()),
        keepalive: true,
      })
    ).json();
  const foreground = (): boolean =>
    !document.hidden &&
    !document.querySelector('[aria-modal="true"],dialog[open]');
  const reason = (): DesktopPoll["reason"] => {
    const state = composer.state;
    if (document.hidden) return "hidden";
    if (!available() || controller.snapshot().loading) return "loading";
    if (document.querySelector('[aria-modal="true"],dialog[open]'))
      return "busy";
    if (state.busyCommand) return "busy";
    if (controller.generating || state.submitting || state.uncertain)
      return "generating";
    if (state.processing) return "busy";
    if (state.text.trim() || state.images.length) return "draft";
    return "";
  };
  const pollValue = (): DesktopPoll => {
    const why = reason();
    return {
      clientId,
      claim,
      active: !document.hidden,
      ready: !why,
      reason: why,
      context: controller.context(),
      ...(composer.state.busyCommand
        ? { activeCommandId: composer.state.busyCommand }
        : {}),
    };
  };
  const handle = async (command: DesktopDelivery): Promise<void> => {
    const initial = composer.context(),
      context = controller.context();
    let success = false,
      error = "";
    try {
      if (!alive || reason() || !foreground())
        throw new Error("RECEIVER_CHANGED");
      composer.set({ busyCommand: command.id });
      await pollServer();
      const image = await uploadImage(
        await canvasBlob(await rasterImage(command.image)),
      );
      composer.assert(initial);
      if (
        !alive ||
        !available() ||
        !foreground() ||
        controller.context() !== context ||
        controller.generating
      )
        throw new Error("RECEIVER_CHANGED");
      composer.set({ images: [image], text: command.prompt }, true);
      const submitted = composer.context();
      await pollServer();
      composer.assert(submitted);
      if (
        !alive ||
        !available() ||
        !foreground() ||
        controller.context() !== context
      )
        throw new Error("RECEIVER_CHANGED");
      await composer.send({ command: { id: command.id, clientId, context } });
      success = true;
    } catch (failure) {
      error = messageOf(failure).slice(0, 240);
    } finally {
      composer.set({ busyCommand: null });
      // A lost acknowledgement never replays a command or repeats its POST.
      try {
        await json("/snap/api/desktop/ack", {
          id: command.id,
          clientId,
          context,
          success,
          ...(error ? { error } : {}),
        });
      } catch {
        /* Desktop records an uncertain receipt. */
      }
    }
  };
  const poll = async (): Promise<void> => {
    if (!alive || polling) return;
    polling = true;
    try {
      const result = schemas.desktopPollResult.parse(await pollServer());
      if (!alive) return;
      claim = result.deferClaim === true;
      if (!result.command) return;
      const command = result.command;
      if (command.id === lastCommand) return;
      lastCommand = command.id;
      await handle(command);
    } catch {
      /* Pairing, pause and disconnection are reflected by the status poll. */
    } finally {
      polling = false;
    }
  };
  const focus = (): void => {
    claim = true;
    void poll();
  };
  const visibility = (): void => {
    if (!document.hidden) claim = true;
    void poll();
  };
  addEventListener("focus", focus);
  document.addEventListener("visibilitychange", visibility);
  const timer = setInterval(() => void poll(), 750);
  void poll();
  return () => {
    alive = false;
    clearInterval(timer);
    removeEventListener("focus", focus);
    document.removeEventListener("visibilitychange", visibility);
  };
}
