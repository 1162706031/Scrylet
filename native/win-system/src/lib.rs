//! Read-only Windows primitives shared by the observer and isolated test driver.
//! No input injection is linked from this crate.
#![cfg(windows)]
use std::ffi::c_void;
use std::io::{self, Read};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
type Handle = *mut c_void;
#[repr(C)]
#[derive(Default, Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}
#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
    fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
    fn CloseHandle(handle: Handle) -> i32;
    fn GetCurrentThreadId() -> u32;
}
#[link(name = "user32")]
extern "system" {
    fn SetProcessDpiAwarenessContext(context: isize) -> i32;
    fn GetThreadDpiAwarenessContext() -> isize;
    fn AreDpiAwarenessContextsEqual(first: isize, second: isize) -> i32;
    fn GetCursorPos(point: *mut Point) -> i32;
    fn GetAsyncKeyState(key: i32) -> i16;
    fn OpenInputDesktop(flags: u32, inherit: i32, access: u32) -> Handle;
    fn CloseDesktop(handle: Handle) -> i32;
    fn GetThreadDesktop(thread: u32) -> Handle;
    fn GetUserObjectInformationW(
        handle: Handle,
        index: i32,
        info: *mut c_void,
        length: u32,
        needed: *mut u32,
    ) -> i32;
}
pub struct Parent(Handle);
impl Parent {
    pub fn open(pid: u32) -> io::Result<Self> {
        if pid == 0 || pid == std::process::id() {
            return Err(io::Error::other("invalid parent"));
        }
        let handle = unsafe { OpenProcess(0x0010_0000, 0, pid) };
        if handle.is_null() {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self(handle))
        }
    }
    // The handle pins the original process object; PID reuse cannot keep us alive.
    pub fn alive(&self) -> bool {
        unsafe { WaitForSingleObject(self.0, 0) == 258 }
    }
}
impl Drop for Parent {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
pub fn physical_dpi() -> io::Result<()> {
    unsafe {
        if SetProcessDpiAwarenessContext(-4) != 0
            || AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), -4) != 0
        {
            Ok(())
        } else {
            Err(io::Error::other("physical DPI awareness unavailable"))
        }
    }
}
pub fn position() -> io::Result<Point> {
    let mut point = Point::default();
    if unsafe { GetCursorPos(&mut point) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(point)
    }
}
pub fn pressed(key: i32) -> bool {
    unsafe { GetAsyncKeyState(key) < 0 }
}
pub fn mouse_key(button: &str) -> Option<i32> {
    match button {
        "left" => Some(1),
        "right" => Some(2),
        "middle" => Some(4),
        "x1" => Some(5),
        "x2" => Some(6),
        _ => None,
    }
}
fn desktop_name(handle: Handle) -> Option<Vec<u16>> {
    if handle.is_null() {
        return None;
    }
    let mut name = [0_u16; 256];
    let mut needed = 0;
    let ok = unsafe {
        GetUserObjectInformationW(
            handle,
            2,
            name.as_mut_ptr().cast(),
            std::mem::size_of_val(&name) as u32,
            &mut needed,
        )
    };
    if ok == 0 || needed < 2 || needed as usize > std::mem::size_of_val(&name) {
        None
    } else {
        Some(name[..(needed / 2 - 1) as usize].to_vec())
    }
}
pub fn input_desktop() -> bool {
    unsafe {
        let desktop = OpenInputDesktop(0, 0, 0x0001 | 0x0100);
        if desktop.is_null() {
            return false;
        }
        let active = desktop_name(desktop);
        let own = desktop_name(GetThreadDesktop(GetCurrentThreadId()));
        CloseDesktop(desktop);
        active.is_some() && active == own
    }
}
pub fn stdin_stop() -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    std::thread::spawn(move || {
        let mut data = [0_u8; 256];
        let mut input = io::stdin().lock();
        while matches!(input.read(&mut data), Ok(n) if n > 0) {}
        thread_stop.store(true, Ordering::SeqCst);
    });
    stop
}
