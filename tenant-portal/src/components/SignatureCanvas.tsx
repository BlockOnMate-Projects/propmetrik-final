"use client";

import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import SignaturePad from "signature_pad";
import { Button } from "./ui/button";

export interface SignatureCanvasHandle {
  clear: () => void;
  toDataURL: () => string | null; // Returns null if empty
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle, { className?: string }>(({ className }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      padRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)'
      });

      const resizeCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          canvas.width = canvas.offsetWidth * ratio;
          canvas.height = canvas.offsetHeight * ratio;
          canvas.getContext("2d")?.scale(ratio, ratio);
          padRef.current?.clear(); // Warning: this clears data on resize
        }
      };

      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      return () => {
        window.removeEventListener("resize", resizeCanvas);
        padRef.current?.off();
      };
    }
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      padRef.current?.clear();
    },
    toDataURL: () => {
      if (padRef.current?.isEmpty()) return null;
      return padRef.current?.toDataURL() || null;
    }
  }));

  return (
    <div className={className}>
      <canvas 
        ref={canvasRef} 
        className="w-full h-full border rounded-md touch-none"
      />
    </div>
  );
});

SignatureCanvas.displayName = "SignatureCanvas";

export default SignatureCanvas;
