import { useEffect, useRef, MutableRefObject } from 'react';
import { Keyboard } from 'react-native';

// Tracks soft-keyboard visibility via a ref so callers can read the
// current value synchronously inside Modal.onRequestClose (Android
// back press) without stale-closure bugs. Pattern: dismiss keyboard
// if open, otherwise close the modal — matching native Android UX.
export function useKeyboardVisible(): MutableRefObject<boolean> {
  const ref = useRef(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => { ref.current = true; });
    const hide = Keyboard.addListener('keyboardDidHide', () => { ref.current = false; });
    return () => { show.remove(); hide.remove(); };
  }, []);
  return ref;
}
