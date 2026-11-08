//! Test-only synthetic input. Never ship this executable in the application.
#[cfg(windows)]
mod windows {
    use scrylet_win_system::{self as os, Parent};
    use std::os::windows::process::CommandExt;
    use std::{
        io::{self, BufRead, Read, Write},
        process::{Child, Command, Stdio},
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
        time::{Duration, Instant},
    };
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Mouse {
        x: i32,
        y: i32,
        data: u32,
        flags: u32,
        time: u32,
        extra: usize,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Keyboard {
        key: u16,
        scan: u16,
        flags: u32,
        time: u32,
        extra: usize,
    }
    #[repr(C)]
    union Data {
        mouse: Mouse,
        keyboard: Keyboard,
    }
    #[repr(C)]
    struct Input {
        kind: u32,
        data: Data,
    }
    #[link(name = "user32")]
    extern "system" {
        fn SendInput(count: u32, input: *const Input, size: i32) -> u32;
        fn SetCursorPos(x: i32, y: i32) -> i32;
    }
    fn send(key: i32, up: bool) -> io::Result<()> {
        let input = match key {
            1 | 2 | 4 | 5 | 6 => {
                let (down, release, data) = match key {
                    1 => (2, 4, 0),
                    2 => (8, 16, 0),
                    4 => (32, 64, 0),
                    5 => (128, 256, 1),
                    _ => (128, 256, 2),
                };
                Input {
                    kind: 0,
                    data: Data {
                        mouse: Mouse {
                            x: 0,
                            y: 0,
                            data,
                            flags: if up { release } else { down },
                            time: 0,
                            extra: 0,
                        },
                    },
                }
            }
            _ => Input {
                kind: 1,
                data: Data {
                    keyboard: Keyboard {
                        key: key as u16,
                        scan: 0,
                        flags: if up { 2 } else { 0 },
                        time: 0,
                        extra: 0,
                    },
                },
            },
        };
        if unsafe { SendInput(1, &input, std::mem::size_of::<Input>() as i32) } != 1 {
            Err(io::Error::other("input rejected"))
        } else {
            Ok(())
        }
    }
    fn point(x: i32, y: i32) -> io::Result<()> {
        if unsafe { SetCursorPos(x, y) } == 0 {
            Err(io::Error::other("cursor rejected"))
        } else {
            Ok(())
        }
    }
    fn key_code(key: &str) -> Option<i32> {
        match key {
            "Ctrl" | "Control" => Some(17),
            "Alt" => Some(18),
            "Shift" => Some(16),
            "Escape" => Some(27),
            _ if key.starts_with('F') => key[1..]
                .parse::<i32>()
                .ok()
                .filter(|n| (1..=24).contains(n))
                .map(|n| 111 + n),
            _ if key.len() == 1 && key.as_bytes()[0].is_ascii_alphanumeric() => {
                Some(key.to_ascii_uppercase().as_bytes()[0] as i32)
            }
            _ => None,
        }
    }
    struct Release {
        keys: Vec<i32>,
        guard: Child,
    }
    impl Release {
        fn new(keys: Vec<i32>) -> io::Result<Self> {
            if keys.is_empty() || keys.iter().any(|key| os::pressed(*key)) {
                return Err(io::Error::other("input already held"));
            }
            let mut guard = Command::new(std::env::current_exe()?)
                .args([
                    "--guard",
                    "--parent",
                    &std::process::id().to_string(),
                    "--keys",
                    &keys
                        .iter()
                        .map(|n| n.to_string())
                        .collect::<Vec<_>>()
                        .join(","),
                ])
                .creation_flags(0x0800_0000)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()?;
            let pipe = guard.stdout.take().unwrap();
            let (sender, receiver) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let mut ready = String::new();
                let _ = io::BufReader::new(pipe).read_line(&mut ready);
                let _ = sender.send(ready);
            });
            if receiver
                .recv_timeout(Duration::from_secs(3))
                .ok()
                .as_deref()
                != Some("guard-ready\n")
            {
                let _ = guard.kill();
                let _ = guard.wait();
                return Err(io::Error::other("release guard unavailable"));
            }
            Ok(Self { keys, guard })
        }
        fn down(&self) -> io::Result<()> {
            for key in &self.keys {
                send(*key, false)?;
            }
            Ok(())
        }
    }
    impl Drop for Release {
        fn drop(&mut self) {
            let mut released = true;
            for key in self.keys.iter().rev() {
                if send(*key, true).is_err() {
                    released = false;
                }
            }
            if let Some(mut pipe) = self.guard.stdin.take() {
                if released {
                    let _ = pipe.write_all(b"released\n");
                    let _ = pipe.flush();
                }
            }
            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline {
                if matches!(self.guard.try_wait(), Ok(Some(_))) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            // Do not force-kill the release guard: it still owns cleanup if the
            // input desktop is temporarily unavailable.
        }
    }
    fn guard(parent: u32, raw: &str) -> io::Result<()> {
        let keys = raw
            .split(',')
            .map(|s| s.parse::<i32>())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| io::Error::other("invalid guard keys"))?;
        if keys.is_empty()
            || keys.len() > 8
            || keys
                .iter()
                .any(|n| !matches!(*n,1|2|4|5|6|16|17|18|27|48..=57|65..=90|112..=135))
        {
            return Err(io::Error::other("invalid guard keys"));
        }
        let parent = Parent::open(parent)?;
        let done = Arc::new(AtomicBool::new(false));
        let released = Arc::new(AtomicBool::new(false));
        let t_done = done.clone();
        let t_released = released.clone();
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = io::stdin().lock().take(32).read_line(&mut text);
            t_released.store(text == "released\n", Ordering::SeqCst);
            t_done.store(true, Ordering::SeqCst);
        });
        println!("guard-ready");
        io::stdout().flush()?;
        while parent.alive() && !done.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(20));
        }
        if !released.load(Ordering::SeqCst) {
            // Retry cleanup briefly if a desktop transition rejects SendInput.
            for _ in 0..100 {
                let mut ok = true;
                for key in keys.iter().rev() {
                    if send(*key, true).is_err() {
                        ok = false;
                    }
                }
                if ok {
                    return Ok(());
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            return Err(io::Error::other("release rejected"));
        }
        Ok(())
    }
    fn pause(parent: &Parent, stop: &AtomicBool, milliseconds: u64) -> io::Result<()> {
        let until = Instant::now() + Duration::from_millis(milliseconds);
        loop {
            if !parent.alive() || stop.load(Ordering::SeqCst) {
                return Err(io::Error::other("input cancelled"));
            }
            if Instant::now() >= until {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    pub fn run() -> io::Result<()> {
        let mut args = std::env::args().skip(1);
        let action = args
            .next()
            .ok_or_else(|| io::Error::other("action required"))?;
        let mut values = std::collections::BTreeMap::new();
        while let Some(key) = args.next() {
            if ![
                "--parent",
                "--x",
                "--y",
                "--to-x",
                "--to-y",
                "--milliseconds",
                "--button",
                "--key",
                "--count",
                "--interval",
                "--keys",
            ]
            .contains(&key.as_str())
                || values.contains_key(&key)
            {
                return Err(io::Error::other("invalid input argument"));
            }
            let value = args
                .next()
                .ok_or_else(|| io::Error::other("value required"))?;
            values.insert(key, value);
        }
        let parent_id = values
            .get("--parent")
            .and_then(|s| s.parse::<u32>().ok())
            .ok_or_else(|| io::Error::other("parent required"))?;
        os::physical_dpi()?;
        if action == "--guard" {
            return guard(
                parent_id,
                values
                    .get("--keys")
                    .ok_or_else(|| io::Error::other("keys required"))?,
            );
        }
        if !["move", "hold", "key", "drag", "click"].contains(&action.as_str())
            || values.contains_key("--keys")
        {
            return Err(io::Error::other("invalid action"));
        }
        let parent = Parent::open(parent_id)?;
        let stop = os::stdin_stop();
        let number = |key: &str, default: i32| -> io::Result<i32> {
            values
                .get(key)
                .map(|s| s.parse().map_err(|_| io::Error::other("invalid number")))
                .unwrap_or(Ok(default))
        };
        let duration = number("--milliseconds", 1300)?;
        if !(0..=15000).contains(&duration) {
            return Err(io::Error::other("invalid duration"));
        }
        if action == "key" {
            let keys = values
                .get("--key")
                .map(String::as_str)
                .unwrap_or("Escape")
                .split('+')
                .map(key_code)
                .collect::<Option<Vec<_>>>()
                .ok_or_else(|| io::Error::other("invalid key"))?;
            if keys.len() > 8 {
                return Err(io::Error::other("too many keys"));
            }
            let release = Release::new(keys)?;
            release.down()?;
            pause(
                &parent,
                &stop,
                if values.contains_key("--milliseconds") {
                    duration as u64
                } else {
                    80
                },
            )?;
        } else {
            let x = number("--x", 0)?;
            let y = number("--y", 0)?;
            if action == "move" {
                if !parent.alive() {
                    return Err(io::Error::other("parent exited"));
                }
                return point(x, y);
            }
            let key = os::mouse_key(values.get("--button").map(String::as_str).unwrap_or("left"))
                .ok_or_else(|| io::Error::other("invalid button"))?;
            let release = Release::new(vec![key])?;
            point(x, y)?;
            let count = if action == "click" {
                number("--count", 1)?
            } else {
                1
            };
            if !(1..=2).contains(&count) {
                return Err(io::Error::other("invalid count"));
            }
            for n in 0..count {
                release.down()?;
                if action == "drag" {
                    let tx = number("--to-x", x)?;
                    let ty = number("--to-y", y)?;
                    let steps = (duration / 20).max(1);
                    for step in 1..=steps {
                        pause(&parent, &stop, 20)?;
                        point(
                            x + ((tx as i64 - x as i64) * step as i64 / steps as i64) as i32,
                            y + ((ty as i64 - y as i64) * step as i64 / steps as i64) as i32,
                        )?;
                    }
                } else {
                    pause(
                        &parent,
                        &stop,
                        if action == "click" {
                            40
                        } else {
                            duration as u64
                        },
                    )?;
                }
                send(key, true)?;
                if n + 1 < count {
                    let gap = number("--interval", 90)?;
                    if !(40..=500).contains(&gap) {
                        return Err(io::Error::other("invalid interval"));
                    }
                    pause(&parent, &stop, gap as u64)?;
                }
            }
        }
        Ok(())
    }
}
fn main() {
    #[cfg(windows)]
    if windows::run().is_err() {
        eprintln!("isolated test input failed");
        std::process::exit(2);
    }
    #[cfg(not(windows))]
    {
        eprintln!("Windows test driver only");
        std::process::exit(2);
    }
}
