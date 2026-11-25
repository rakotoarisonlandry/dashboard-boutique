import { useEffect, useRef, useState } from 'react';
import { Modal } from './common';

/** Back camera on tablets and phones; any camera (laptop webcam) as a second try. */
async function openCamera() {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (cause) {
    if (cause?.name === 'NotAllowedError' || cause?.name === 'SecurityError') throw cause;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

/** Says what actually went wrong, so the agent knows what to do. */
function cameraError(cause) {
  switch (cause?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Accès à la caméra refusé. Cliquez sur l’icône à gauche de l’adresse du site, autorisez la caméra, puis réessayez.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Aucune caméra détectée sur cet appareil. Utilisez une tablette ou un téléphone, ou saisissez la référence à la main.';
    case 'NotReadableError':
    case 'AbortError':
      return 'La caméra est déjà utilisée par une autre application (visio, appareil photo). Fermez-la puis réessayez.';
    default:
      return 'La caméra n’a pas pu s’ouvrir. Saisissez la référence à la main.';
  }
}

/** Scans every ~200 ms: fast enough to feel instant, light on a tablet battery. */
const SCAN_EVERY_MS = 200;

/**
 * Reads a ticket QR code with the device camera.
 * Native BarcodeDetector (Chrome, Edge, Android) first; jsQR, loaded only when needed, elsewhere.
 */
export function QrScanner({ onResult, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const done = useRef(onResult);
  useEffect(() => { done.current = onResult; });

  useEffect(() => {
    let stream = null;
    let frame = 0;
    let stopped = false;
    let last = 0;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('La caméra n’est disponible que sur une adresse sécurisée (https). Saisissez la référence à la main.');
        return;
      }
      let decode;
      if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats?.())?.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        decode = async source => (await detector.detect(source))[0]?.rawValue ?? null;
      } else {
        const { default: jsQR } = await import('jsqr');
        decode = async source => {
          canvas.width = source.videoWidth;
          canvas.height = source.videoHeight;
          context.drawImage(source, 0, 0);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
        };
      }
      try {
        stream = await openCamera();
      } catch (cause) {
        setError(cameraError(cause));
        return;
      }
      if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      setReady(true);
      const tick = async now => {
        if (stopped) return;
        const source = video.current;
        if (now - last >= SCAN_EVERY_MS && source?.readyState >= 2 && source.videoWidth) {
          last = now;
          const text = (await decode(source).catch(() => null))?.trim();
          if (text && !stopped) {
            stop();
            navigator.vibrate?.(60);
            done.current(text);
            return;
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    })();

    return stop;
  }, []);

  return <Modal onClose={onClose} label="Scanner un ticket">
    <span className="eyebrow">Accueil au guichet</span>
    <h2>Scanner le QR code</h2>
    <p>Présentez le ticket du client devant la caméra. La vérification se lance toute seule.</p>
    {error ? <div className="notice" role="alert">{error}</div> : (
      <div className="qr-frame">
        <video ref={video} muted playsInline aria-label="Image de la caméra" />
        <span className="qr-target" aria-hidden="true" />
        {!ready && <span className="qr-status">Ouverture de la caméra…</span>}
      </div>
    )}
    <div className="dialog-actions"><button type="button" className="btn ghost" onClick={onClose}>Saisir à la main</button></div>
  </Modal>;
}
