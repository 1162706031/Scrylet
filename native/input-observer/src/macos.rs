//! Passive macOS mouse observation. The event tap never modifies or posts input.
use std::{
    ffi::{c_char, c_int, c_void},
    io::{self, Read},
    ptr, thread,
    time::Duration,
};

type Ref = *mut c_void;
type EventCallback = unsafe extern "C" fn(Ref, u32, Ref, Ref) -> Ref;

#[repr(C)]
struct Point {
    x: f64,
    y: f64,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
    fn CGEventTapCreate(
        location: u32,
        placement: u32,
        options: u32,
        mask: u64,
        callback: Option<EventCallback>,
        info: Ref,
    ) -> Ref;
    fn CGEventTapEnable(tap: Ref, enabled: bool);
    fn CGEventGetLocation(event: Ref) -> Point;
    fn CGEventGetIntegerValueField(event: Ref, field: u32) -> i64;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFRunLoopCommonModes: Ref;
    fn CFMachPortCreateRunLoopSource(allocator: Ref, port: Ref, order: isize) -> Ref;
    fn CFRunLoopGetCurrent() -> Ref;
    fn CFRunLoopAddSource(run_loop: Ref, source: Ref, mode: Ref);
    fn CFRunLoopRun();
}

extern "C" {
    fn kill(pid: c_int, signal: c_int) -> c_int;
    fn signal(number: c_int, handler: usize) -> usize;
    fn write(fd: c_int, bytes: *const c_void, count: usize) -> isize;
    fn snprintf(buffer: *mut c_char, count: usize, format: *const c_char, ...) -> c_int;
}

const LEFT_DOWN: u32 = 1;
const LEFT_UP: u32 = 2;
const RIGHT_DOWN: u32 = 3;
const RIGHT_UP: u32 = 4;
const MOVED: u32 = 5;
const LEFT_DRAGGED: u32 = 6;
const RIGHT_DRAGGED: u32 = 7;
const OTHER_DOWN: u32 = 25;
const OTHER_UP: u32 = 26;
const OTHER_DRAGGED: u32 = 27;
const TAP_TIMEOUT: u32 = 0xffff_fffe;
const TAP_DISABLED: u32 = 0xffff_ffff;
const BUTTON_NUMBER: u32 = 3;

struct State {
    button: i64,
    pressed: bool,
    tap: Ref,
}

fn emit_point(kind: &[u8], event: Ref) {
    // Quartz global coordinates are in display points, matching Electron's Mac DIP bounds.
    let point = unsafe { CGEventGetLocation(event) };
    if !point.x.is_finite()
        || !point.y.is_finite()
        || point.x < i32::MIN as f64
        || point.x > i32::MAX as f64
        || point.y < i32::MIN as f64
        || point.y > i32::MAX as f64
    {
        return;
    }
    let mut line = [0i8; 128];
    let length = unsafe {
        snprintf(
            line.as_mut_ptr(),
            line.len(),
            c"{\"protocolVersion\":1,\"type\":\"%s\",\"x\":%d,\"y\":%d}\n".as_ptr(),
            kind.as_ptr(),
            point.x.round() as c_int,
            point.y.round() as c_int,
        )
    };
    if length < 0
        || length as usize >= line.len()
        || unsafe { write(1, line.as_ptr().cast(), length as usize) } != length as isize
    {
        std::process::exit(0);
    }
}

unsafe extern "C" fn observe(_proxy: Ref, event_type: u32, event: Ref, info: Ref) -> Ref {
    let state = &mut *info.cast::<State>();
    if event_type == TAP_TIMEOUT {
        CGEventTapEnable(state.tap, true);
        return event;
    }
    if event_type == TAP_DISABLED {
        std::process::exit(2);
    }
    let down = matches!(event_type, LEFT_DOWN | RIGHT_DOWN | OTHER_DOWN);
    let up = matches!(event_type, LEFT_UP | RIGHT_UP | OTHER_UP);
    if down || up {
        if CGEventGetIntegerValueField(event, BUTTON_NUMBER) != state.button {
            return event;
        }
        if down && !state.pressed {
            state.pressed = true;
            emit_point(b"down\0", event);
        } else if up && state.pressed {
            state.pressed = false;
            emit_point(b"up\0", event);
        }
    } else if state.pressed
        && matches!(
            event_type,
            MOVED | LEFT_DRAGGED | RIGHT_DRAGGED | OTHER_DRAGGED
        )
    {
        emit_point(b"move\0", event);
    }
    event
}

fn arguments() -> io::Result<(c_int, i64)> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 4 || args[0] != "--parent" || args[2] != "--button" {
        return Err(io::Error::other("invalid observer argument"));
    }
    let parent = args[1]
        .parse::<c_int>()
        .map_err(|_| io::Error::other("invalid parent"))?;
    if parent <= 1 || parent == std::process::id() as c_int {
        return Err(io::Error::other("invalid parent"));
    }
    let button = match args[3].as_str() {
        "left" => 0,
        "right" => 1,
        "middle" => 2,
        "x1" => 3,
        "x2" => 4,
        _ => return Err(io::Error::other("invalid button")),
    };
    Ok((parent, button))
}

pub fn run() -> io::Result<()> {
    let (parent, button) = arguments()?;
    if unsafe { kill(parent, 0) } != 0 && io::Error::last_os_error().raw_os_error() == Some(3) {
        return Err(io::Error::other("parent exited"));
    }
    // SIGPIPE is ignored so a closed parent pipe exits without an FFI callback panic.
    unsafe {
        signal(13, 1);
    }
    if !unsafe { CGPreflightListenEventAccess() || CGRequestListenEventAccess() } {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Input Monitoring permission required",
        ));
    }
    let types = [
        LEFT_DOWN,
        LEFT_UP,
        RIGHT_DOWN,
        RIGHT_UP,
        OTHER_DOWN,
        OTHER_UP,
        MOVED,
        LEFT_DRAGGED,
        RIGHT_DRAGGED,
        OTHER_DRAGGED,
    ];
    let mask = types
        .into_iter()
        .fold(0u64, |mask, event| mask | (1u64 << event));
    let state = Box::into_raw(Box::new(State {
        button,
        pressed: false,
        tap: ptr::null_mut(),
    }));
    let tap = unsafe { CGEventTapCreate(1, 0, 1, mask, Some(observe), state.cast()) };
    if tap.is_null() {
        unsafe {
            drop(Box::from_raw(state));
        }
        return Err(io::Error::other("passive event tap unavailable"));
    }
    unsafe {
        (*state).tap = tap;
    }
    let source = unsafe { CFMachPortCreateRunLoopSource(ptr::null_mut(), tap, 0) };
    if source.is_null() {
        return Err(io::Error::other("event tap run loop unavailable"));
    }
    unsafe {
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
        CGEventTapEnable(tap, true);
    }
    thread::spawn(|| {
        let mut byte = [0u8; 1];
        match io::stdin().read(&mut byte) {
            Ok(0) => std::process::exit(0),
            _ => std::process::exit(2),
        }
    });
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(100));
        if unsafe { kill(parent, 0) } != 0 && io::Error::last_os_error().raw_os_error() == Some(3) {
            std::process::exit(0);
        }
    });
    println!("{{\"protocolVersion\":1,\"type\":\"ready\",\"coordinateSpace\":\"dip\"}}");
    unsafe {
        CFRunLoopRun();
    }
    Ok(())
}
