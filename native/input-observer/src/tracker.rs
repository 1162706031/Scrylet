use scrylet_win_system::Point;
#[derive(Debug, PartialEq)]
pub enum Event {
    Cancel,
    Point(&'static str, Point),
}
pub struct Tracker {
    previous: bool,
    point: Option<Point>,
    available: bool,
    await_release: bool,
}
impl Tracker {
    pub fn new(held_at_start: bool) -> Self {
        Self {
            previous: false,
            point: None,
            available: true,
            await_release: held_at_start,
        }
    }
    pub fn sample(&mut self, point: Option<Point>, down: bool) -> Option<Event> {
        let Some(point) = point else {
            let cancel = self.available || self.previous;
            self.previous = false;
            self.point = None;
            self.available = false;
            self.await_release = true;
            return if cancel { Some(Event::Cancel) } else { None };
        };
        self.available = true;
        if self.await_release {
            if !down {
                self.await_release = false;
            }
            return None;
        }
        let event = if down && !self.previous {
            Some(Event::Point("down", point))
        } else if !down && self.previous {
            Some(Event::Point("up", point))
        } else if down && self.point != Some(point) {
            Some(Event::Point("move", point))
        } else {
            None
        };
        self.previous = down;
        self.point = Some(point);
        event
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn desktop_loss_cancels_and_requires_release() {
        let p = Point { x: -320, y: 240 };
        let mut t = Tracker::new(false);
        assert_eq!(t.sample(Some(p), true), Some(Event::Point("down", p)));
        assert_eq!(t.sample(None, true), Some(Event::Cancel));
        assert_eq!(t.sample(None, true), None);
        assert_eq!(t.sample(Some(p), true), None);
        assert_eq!(t.sample(Some(p), false), None);
        assert_eq!(t.sample(Some(p), true), Some(Event::Point("down", p)));
    }
    #[test]
    fn initial_hold_is_not_a_new_gesture() {
        let p = Point { x: 20, y: 30 };
        let mut t = Tracker::new(true);
        assert_eq!(t.sample(Some(p), true), None);
        assert_eq!(t.sample(Some(p), false), None);
        assert_eq!(t.sample(Some(p), true), Some(Event::Point("down", p)));
    }
    #[test]
    fn no_coordinate_conversion_and_no_idle_moves() {
        let a = Point { x: -900, y: 1350 };
        let b = Point { x: -650, y: 1000 };
        let mut t = Tracker::new(false);
        assert_eq!(t.sample(Some(a), false), None);
        assert_eq!(t.sample(Some(a), true), Some(Event::Point("down", a)));
        assert_eq!(t.sample(Some(b), true), Some(Event::Point("move", b)));
        assert_eq!(t.sample(Some(b), false), Some(Event::Point("up", b)));
    }
}
