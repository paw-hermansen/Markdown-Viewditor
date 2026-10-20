use std::sync::{Mutex as StdMutex, MutexGuard};
use std::time::Duration;

use tauri::Manager;

use crate::error::AppError;
use crate::state::WindowState;

/// How long the window has to be left alone before its geometry is written.
const DEBOUNCE: Duration = Duration::from_millis(500);

/// Debounce bookkeeping for the window-state write. Deliberately free of
/// Tauri types so the timing rules can be tested on their own.
#[derive(Default)]
struct DebounceState {
    /// Bumped on every observed change.
    generation: u64,
    /// The generation the running timer is waiting out.
    armed_for: u64,
    /// A trailing timer thread is running.
    armed: bool,
    /// The last generation written to the store.
    written: u64,
}

/// What a trailing timer should do once `DEBOUNCE` has elapsed.
enum Elapsed {
    /// The window has settled — write the state.
    Write,
    /// Changes arrived while waiting; wait again for them.
    WaitLonger,
    /// Nothing is owed; someone else already wrote it.
    NothingOwed,
}

impl DebounceState {
    /// Record an outstanding change. Returns `true` when the caller must
    /// start a trailing timer, `false` when one is already running and will
    /// pick this change up.
    fn note_change(&mut self) -> bool {
        self.generation += 1;
        if self.armed {
            false
        } else {
            self.armed = true;
            self.armed_for = self.generation;
            true
        }
    }

    /// A trailing timer has waited out `DEBOUNCE`.
    fn on_elapsed(&mut self) -> Elapsed {
        if self.armed_for != self.generation {
            // Changes came in while we waited. They are newer than what we
            // would write now, so wait again instead of persisting a state
            // that is already stale.
            self.armed_for = self.generation;
            return Elapsed::WaitLonger;
        }
        self.armed = false;
        if self.written == self.generation {
            Elapsed::NothingOwed
        } else {
            self.written = self.generation;
            Elapsed::Write
        }
    }

    /// Take the pending write, if any — for a shutdown path that cannot wait
    /// out the trailing timer.
    fn take_pending(&mut self) -> bool {
        if self.written == self.generation {
            false
        } else {
            self.written = self.generation;
            true
        }
    }
}

static DEBOUNCE_STATE: StdMutex<DebounceState> = StdMutex::new(DebounceState {
    generation: 0,
    armed_for: 0,
    armed: false,
    written: 0,
});

/// A lock that survives a panic on another thread instead of poisoning the
/// window-state save forever.
fn lock_debounce() -> MutexGuard<'static, DebounceState> {
    DEBOUNCE_STATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn persist_window_state(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) {
            let is_maximized = window.is_maximized().unwrap_or(false);
            let state = WindowState {
                x: position.x as f64,
                y: position.y as f64,
                width: size.width as f64,
                height: size.height as f64,
                maximized: is_maximized,
            };
            let Ok(value) = serde_json::to_value(&state) else {
                return;
            };
            if let Ok(store) =
                tauri_plugin_store::StoreBuilder::new(app, "window-state.json").build()
            {
                store.set("windowState", value);
                let _ = store.save();
            }
        }
    }
}

#[tauri::command]
pub async fn save_window_state(app: tauri::AppHandle) -> Result<(), AppError> {
    persist_window_state(&app);
    Ok(())
}

#[tauri::command]
pub fn force_close_window(app: tauri::AppHandle) {
    // destroy() skips the normal exit path, so settle the window state here.
    flush_window_state(&app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.destroy();
    }
}

/// Persist the window geometry once the window has been left alone for
/// {@link DEBOUNCE}.
///
/// This is a trailing debounce, not a "save at most every 500 ms" throttle:
/// every change is eventually written, and the *last* one — the final
/// position after a drag — is written too. A throttle drops everything in
/// the tail of a burst and the window never comes back where it was left.
pub fn save_window_state_debounced(app: &tauri::AppHandle) {
    let start_timer = lock_debounce().note_change();
    if !start_timer {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(DEBOUNCE);
        // Take the decision under the lock, then drop it before writing —
        // persisting does file I/O and must not block other callers.
        let outcome = lock_debounce().on_elapsed();
        match outcome {
            Elapsed::Write => {
                persist_window_state(&app);
                break;
            }
            Elapsed::WaitLonger => continue,
            Elapsed::NothingOwed => break,
        }
    });
}

/// Write any pending window-state change immediately. Used on the shutdown
/// paths, where waiting out the trailing timer would lose the final geometry.
pub fn flush_window_state(app: &tauri::AppHandle) {
    if lock_debounce().take_pending() {
        persist_window_state(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_change_arms_a_timer_and_bursts_do_not() {
        let mut state = DebounceState::default();
        // The first change in a burst arms the trailing timer...
        assert!(state.note_change());
        // ...and the rest of the burst rides along with it.
        assert!(!state.note_change());
        assert!(!state.note_change());
    }

    #[test]
    fn writes_once_the_window_settles() {
        let mut state = DebounceState::default();
        state.note_change();
        assert!(matches!(state.on_elapsed(), Elapsed::Write));
        // And there is nothing left to do afterwards.
        assert!(matches!(state.on_elapsed(), Elapsed::NothingOwed));
    }

    #[test]
    fn the_last_change_of_a_burst_is_written() {
        // The bug this guards: a burst of move/resize events, with the final
        // one landing inside the wait window, used to be dropped entirely —
        // the throttle wrote the first event and discarded the rest, so the
        // window never came back where it was left.
        let mut state = DebounceState::default();
        state.note_change();
        state.note_change();
        state.note_change(); // the final drag event

        // The first wait sees that the state moved on, so it waits again
        // rather than writing something already stale...
        assert!(matches!(state.on_elapsed(), Elapsed::WaitLonger));
        // ...and the next one settles and writes the final geometry.
        assert!(matches!(state.on_elapsed(), Elapsed::Write));
    }

    #[test]
    fn a_burst_that_keeps_going_keeps_waiting() {
        let mut state = DebounceState::default();
        state.note_change();
        for _ in 0..5 {
            // Each change lands while the timer is waiting out its interval,
            // so the write is held back for it rather than firing early.
            state.note_change();
            assert!(matches!(state.on_elapsed(), Elapsed::WaitLonger));
        }
        assert!(matches!(state.on_elapsed(), Elapsed::Write));
    }

    #[test]
    fn flush_reports_only_unwritten_changes() {
        let mut state = DebounceState::default();
        // Nothing has happened yet: nothing to flush.
        assert!(!state.take_pending());

        state.note_change();
        state.note_change();
        assert!(state.take_pending());
        // Already written — a second flush (exit after force-close) is a no-op.
        assert!(!state.take_pending());
    }

    #[test]
    fn flush_then_timer_does_not_write_twice() {
        let mut state = DebounceState::default();
        state.note_change();
        assert!(state.take_pending());
        // The trailing timer still runs, but finds nothing owed.
        assert!(matches!(state.on_elapsed(), Elapsed::NothingOwed));
    }

    #[test]
    fn flush_picks_up_changes_that_came_after_it() {
        let mut state = DebounceState::default();
        state.note_change();
        assert!(state.take_pending());
        state.note_change();
        assert!(state.take_pending());
    }
}
