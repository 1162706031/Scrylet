"""Windows desktop acceptance input, targeting the test application's own board."""
import argparse
import ctypes
import time

parser = argparse.ArgumentParser()
parser.add_argument("action", choices=["move", "hold", "key"])
parser.add_argument("--x", type=int, default=0)
parser.add_argument("--y", type=int, default=0)
parser.add_argument("--milliseconds", type=int, default=1300)
parser.add_argument("--button", choices=["left", "right", "middle"], default="left")
parser.add_argument("--key", default="Escape")
args = parser.parse_args()
user32 = ctypes.WinDLL("user32", use_last_error=True)
user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
if args.action in ["move", "hold"]:
    if not user32.SetCursorPos(args.x, args.y):
        raise ctypes.WinError(ctypes.get_last_error())
    if args.action == "hold":
        down, up = {"left": (2, 4), "right": (8, 16), "middle": (32, 64)}[args.button]
        user32.mouse_event(down, 0, 0, 0, 0)
        try:
            time.sleep(args.milliseconds / 1000)
        finally:
            user32.mouse_event(up, 0, 0, 0, 0)
else:
    aliases = {"Ctrl": 17, "Alt": 18, "Shift": 16, "Escape": 27}
    keys = [aliases[key] if key in aliases else 111 + int(key[1:]) for key in args.key.split("+")]
    for key in keys:
        user32.keybd_event(key, 0, 0, 0)
    time.sleep(0.08)
    for key in reversed(keys):
        user32.keybd_event(key, 0, 2, 0)
