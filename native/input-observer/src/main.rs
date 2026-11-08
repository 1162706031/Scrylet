#[cfg(windows)]
mod tracker;
#[cfg(windows)]
fn run() -> std::io::Result<()> {
    use scrylet_win_system::{self as os, Parent};
    use std::{
        io::{self, Write},
        sync::atomic::Ordering,
        time::Duration,
    };
    let mut args = std::env::args().skip(1);
    let mut parent = None;
    let mut button = None;
    while let Some(key) = args.next() {
        match key.as_str() {
            "--parent" if parent.is_none() => {
                parent = args.next().and_then(|s| s.parse::<u32>().ok())
            }
            "--button" if button.is_none() => button = args.next().and_then(|s| os::mouse_key(&s)),
            _ => return Err(io::Error::other("invalid observer argument")),
        }
    }
    let parent = Parent::open(parent.ok_or_else(|| io::Error::other("parent required"))?)?;
    let key = button.ok_or_else(|| io::Error::other("button required"))?;
    os::physical_dpi()?;
    if !parent.alive() {
        return Err(io::Error::other("parent exited"));
    }
    let stop = os::stdin_stop();
    let mut output = io::stdout().lock();
    writeln!(
        output,
        "{{\"protocolVersion\":1,\"type\":\"ready\",\"coordinateSpace\":\"physical\"}}"
    )?;
    output.flush()?;
    let mut tracker = tracker::Tracker::new(os::pressed(key));
    while parent.alive() && !stop.load(Ordering::SeqCst) {
        std::thread::sleep(Duration::from_millis(20));
        let point = if os::input_desktop() {
            os::position().ok()
        } else {
            None
        };
        match tracker.sample(point, os::pressed(key)) {
            Some(tracker::Event::Cancel) => {
                writeln!(output, "{{\"protocolVersion\":1,\"type\":\"cancel\"}}")?
            }
            Some(tracker::Event::Point(kind, point)) => writeln!(
                output,
                "{{\"protocolVersion\":1,\"type\":\"{}\",\"x\":{},\"y\":{}}}",
                kind, point.x, point.y
            )?,
            None => continue,
        }
        output.flush()?;
    }
    writeln!(output, "{{\"protocolVersion\":1,\"type\":\"cancel\"}}")?;
    output.flush()
}
fn main() {
    #[cfg(windows)]
    if run().is_err() {
        eprintln!("input observer unavailable");
        std::process::exit(2);
    }
    #[cfg(not(windows))]
    {
        eprintln!("Windows observer only");
        std::process::exit(2);
    }
}
