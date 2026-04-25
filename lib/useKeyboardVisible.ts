import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

// Tracks soft-keyboard visibility so callers can branch on it inside
// Modal.onRequestClose (Android back press): dismiss the keyboard if
// open, otherwise close the modal — matching native Android UX.
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}
