"""Observe configurable mouse buttons on Windows; never suppress OS input."""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
import sys
import threading
import time

import psutil


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parent", type=int, required=True)
    parser.add_argument("--button", choices=["left", "right", "middle", "x1", "x2"], required=True)
    args = parser.parse_args()
    if sys.platform != "win32":
        raise RuntimeError("Global mouse input is available on Windows only")
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.GetAsyncKeyState.argtypes = [ctypes.c_int]
    user32.GetAsyncKeyState.restype = ctypes.c_short
    user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
    user32.GetCursorPos.restype = wintypes.BOOL
    user32.OpenInputDesktop.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    user32.OpenInputDesktop.restype = wintypes.HANDLE
    user32.CloseDesktop.argtypes = [wintypes.HANDLE]
    try:
        user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except AttributeError:
        pass
    stop = threading.Event()

    def watch_pipe():
        while os.read(sys.stdin.fileno(), 1024):
            pass
        stop.set()

    threading.Thread(target=watch_pipe, daemon=True).start()
    parent = psutil.Process(args.parent)
    created = parent.create_time()
    button = {"left": 1, "right": 2, "middle": 4, "x1": 5, "x2": 6}[args.button]
    previous = False
    last_point = None
    checks = 0

    def emit(kind, point=None):
        data = {"type": kind}
        if point is not None:
            data.update(x=point.x, y=point.y)
        print(json.dumps(data), flush=True)

    emit("ready")
    while not stop.wait(0.02):
        checks += 1
        if checks % 25 == 0:
            try:
                if not parent.is_running() or parent.create_time() != created:
                    return
            except psutil.Error:
                return
            desktop = user32.OpenInputDesktop(0, False, 0x0100)
            if not desktop:
                if previous:
                    emit("cancel")
                previous = False
                continue
            user32.CloseDesktop(desktop)
        pressed = bool(user32.GetAsyncKeyState(button) & 0x8000)
        point = wintypes.POINT()
        if not user32.GetCursorPos(ctypes.byref(point)):
            if previous:
                emit("cancel")
            previous = False
            continue
        if pressed and not previous:
            emit("down", point)
        elif not pressed and previous:
            emit("up", point)
        elif pressed and last_point != (point.x, point.y):
            emit("move", point)
        previous = pressed
        last_point = (point.x, point.y)


if __name__ == "__main__":
    try:
        main()
    except (BrokenPipeError, KeyboardInterrupt):
        pass
