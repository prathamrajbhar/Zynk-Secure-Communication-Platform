'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Square, Send, Trash2, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import logger from '@/lib/logger';

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export default function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm',
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
        audioContext.close();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      // Visualize
      drawWaveform();
    } catch (err) {
      logger.error('Microphone access denied:', err);
      onCancel();
    }
  }, [onCancel]);

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [startRecording]);

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b5fc7';
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.6 + (dataArray[i] / 255) * 0.4;
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - barHeight, Math.max(barWidth - 1, 1), barHeight, 1);
        ctx.fill();
        x += barWidth + 1;
      }
      ctx.globalAlpha = 1;
    };

    draw();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsRecording(false);
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, duration);
    } else if (isRecording) {
      // Stop and send
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          onSend(blob, duration);
        };
        mediaRecorderRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  };

  const handleDiscard = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    onCancel();
  };

  const togglePlayback = () => {
    if (!audioBlob) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 w-full animate-fade-in">
      {/* Discard button */}
      <button onClick={handleDiscard}
        className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--danger)] hover:bg-red-500/10 transition-colors flex-shrink-0">
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Waveform / playback */}
      <div className="flex-1 flex items-center gap-2 bg-[var(--bg-wash)] rounded-2xl px-3 py-2 min-w-0">
        {!audioBlob && isRecording && (
          <>
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <canvas ref={canvasRef} className="flex-1 h-8" width={300} height={32} />
          </>
        )}
        {audioBlob && (
          <button onClick={togglePlayback} className="btn-icon w-8 h-8 flex-shrink-0">
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        )}
        {audioBlob && (
          <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full">
            <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: isPlaying ? '100%' : '0%', transition: isPlaying ? `width ${duration}s linear` : 'none' }} />
          </div>
        )}
        <span className={cn('text-xs font-mono tabular-nums flex-shrink-0', isRecording ? 'text-red-500' : 'text-[var(--text-muted)]')}>
          {formatDuration(duration)}
        </span>
      </div>

      {/* Stop / Send button */}
      {isRecording ? (
        <button onClick={stopRecording}
          className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0 hover:bg-red-600 transition-colors">
          <Square className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={handleSend}
          className="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center flex-shrink-0 hover:bg-[var(--accent-hover)] transition-colors">
          <Send className="w-4 h-4 ml-0.5" />
        </button>
      )}
    </div>
  );
}
