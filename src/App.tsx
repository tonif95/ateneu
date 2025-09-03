import React, { useState, useRef, useCallback } from 'react';
import { Camera, CheckCircle, AlertCircle, RotateCcw, User, XCircle, UserCheck } from 'lucide-react';

interface CaptureState {
  status: 'idle' | 'camera-active' | 'capturing' | 'sending' | 'success' | 'error' | 'user-found' | 'user-not-found' | 'no-face';
  message: string;
  recognitionData?: {
    personId?: string;
    similarity?: number;
    confidence?: number;
    ui?: {
      title: string;
      subtitle: string;
      color: string;
      icon: string;
    };
  };
}

function App() {
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: 'idle',
    message: ''
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setCaptureState({ status: 'camera-active', message: 'Activando cámara...' });
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setCaptureState({ status: 'camera-active', message: 'Cámara lista. Toque para tomar foto.' });
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCaptureState({ 
        status: 'error', 
        message: 'No se pudo acceder a la cámara. Verifique los permisos.' 
      });
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      setCaptureState({ status: 'capturing', message: 'Tomando foto...' });

      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');

      if (!context) throw new Error('No se pudo obtener el contexto del canvas');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.8);
      });

      await sendToWebhook(blob);

    } catch (error) {
      console.error('Error capturing photo:', error);
      setCaptureState({ 
        status: 'error', 
        message: 'Error al tomar la foto. Intente nuevamente.' 
      });
    }
  }, []);

  const sendToWebhook = async (imageBlob: Blob) => {
    try {
      setCaptureState({ status: 'sending', message: 'Procesando reconocimiento facial...' });

      const formData = new FormData();
      formData.append('image', imageBlob, 'patient-photo.jpg');
      formData.append('timestamp', new Date().toISOString());

      const response = await fetch('https://test.mamaencalma.com/webhook/facial-recognition', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        handleRecognitionResult(result);
        stopCamera();
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error sending to webhook:', error);
      setCaptureState({ 
        status: 'error', 
        message: 'Error al procesar la imagen. Verifique la conexión.' 
      });
    }
  };

  const handleRecognitionResult = (result: any) => {
    console.log('Recognition result:', result);

    if (result.status === 'user_found') {
      setCaptureState({
        status: 'user-found',
        message: result.message,
        recognitionData: result
      });
    } else if (result.status === 'user_not_found') {
      setCaptureState({
        status: 'user-not-found',
        message: result.message,
        recognitionData: result
      });
    } else if (result.status === 'no_face_detected') {
      setCaptureState({
        status: 'no-face',
        message: result.message,
        recognitionData: result
      });
    } else {
      setCaptureState({
        status: 'error',
        message: result.message || 'Error desconocido en el reconocimiento'
      });
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetCapture = useCallback(() => {
    stopCamera();
    setCaptureState({ status: 'idle', message: '' });
  }, [stopCamera]);

  const getStatusColor = () => {
    switch (captureState.status) {
      case 'user-found': return 'text-green-600';
      case 'user-not-found': return 'text-orange-600';
      case 'no-face': case 'error': return 'text-red-600';
      case 'sending': case 'capturing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = () => {
    switch (captureState.status) {
      case 'user-found': return <UserCheck className="w-12 h-12" />;
      case 'user-not-found': return <AlertCircle className="w-12 h-12" />;
      case 'no-face': return <XCircle className="w-12 h-12" />;
      case 'error': return <AlertCircle className="w-12 h-12" />;
      case 'camera-active': return <Camera className="w-12 h-12" />;
      default: return <User className="w-12 h-12" />;
    }
  };

  const getStatusBackground = () => {
    switch (captureState.status) {
      case 'user-found': return 'bg-green-100 border-green-300';
      case 'user-not-found': return 'bg-orange-100 border-orange-300';
      case 'no-face': case 'error': return 'bg-red-100 border-red-300';
      case 'sending': case 'capturing': return 'bg-blue-100 border-blue-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600 p-4 rounded-full shadow-lg">
              <User className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Asistente de Rehabilitación
          </h1>
          <p className="text-xl text-gray-600">
            Sistema de Reconocimiento Facial
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
          {/* Camera Section */}
          <div className="relative mb-8">
            <div className="aspect-video bg-gray-100 rounded-2xl overflow-hidden border-4 border-gray-200 relative">
              {captureState.status === 'camera-active' || captureState.status === 'capturing' ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <Camera className="w-24 h-24 text-gray-400 mx-auto mb-4" />
                    <p className="text-2xl text-gray-500 font-medium">
                      Cámara inactiva
                    </p>
                  </div>
                </div>
              )}
              
              {captureState.status === 'capturing' && (
                <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
                  <div className="bg-blue-600 text-white px-6 py-3 rounded-full text-xl font-semibold">
                    📸 Capturando...
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Status Message */}
          <div className="text-center mb-8">
            <div className={`inline-block p-8 rounded-3xl border-2 ${getStatusBackground()}`}>
              <div className={`flex items-center justify-center mb-4 ${getStatusColor()}`}>
                {getStatusIcon()}
              </div>
              
              {captureState.recognitionData?.ui ? (
                <div>
                  <h2 className={`text-3xl font-bold mb-2 ${getStatusColor()}`}>
                    {captureState.recognitionData.ui.title}
                  </h2>
                  <p className={`text-xl mb-4 ${getStatusColor()}`}>
                    {captureState.recognitionData.ui.subtitle}
                  </p>
                  
                  {captureState.status === 'user-found' && captureState.recognitionData.similarity && (
                    <div className="bg-white rounded-2xl p-4 mt-4 shadow-inner">
                      <div className="text-sm text-gray-600 mb-2">Detalles del reconocimiento:</div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-semibold">Similitud:</span>
                          <div className="text-2xl font-bold text-green-600">
                            {captureState.recognitionData.similarity}%
                          </div>
                        </div>
                        <div>
                          <span className="font-semibold">Confianza:</span>
                          <div className="text-2xl font-bold text-green-600">
                            {captureState.recognitionData.confidence}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className={`text-2xl font-semibold ${getStatusColor()}`}>
                  {captureState.message || 'Listo para comenzar'}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {captureState.status === 'idle' && (
              <button
                onClick={startCamera}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-4 min-h-[80px]"
              >
                <Camera className="w-8 h-8" />
                Activar Cámara
              </button>
            )}

            {captureState.status === 'camera-active' && (
              <>
                <button
                  onClick={capturePhoto}
                  className="bg-green-600 hover:bg-green-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-4 min-h-[80px]"
                >
                  <Camera className="w-8 h-8" />
                  Tomar Foto
                </button>
                <button
                  onClick={resetCapture}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-4 min-h-[80px]"
                >
                  <RotateCcw className="w-8 h-8" />
                  Cancelar
                </button>
              </>
            )}

            {(['user-found', 'user-not-found', 'no-face', 'error'].includes(captureState.status)) && (
              <button
                onClick={resetCapture}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-4 min-h-[80px]"
              >
                <RotateCcw className="w-8 h-8" />
                Comenzar de Nuevo
              </button>
            )}

            {(captureState.status === 'capturing' || captureState.status === 'sending') && (
              <div className="bg-gray-300 text-gray-500 px-12 py-6 rounded-2xl text-2xl font-bold flex items-center justify-center gap-4 min-h-[80px] cursor-not-allowed">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
                Procesando...
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
          <h2 className="text-2xl font-bold text-blue-800 mb-4 text-center">
            Instrucciones
          </h2>
          <div className="space-y-3 text-lg text-blue-700">
            <div className="flex items-center gap-3">
              <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">1</span>
              <span>Toque "Activar Cámara" para comenzar</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">2</span>
              <span>Posicione su rostro frente a la cámara</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">3</span>
              <span>Toque "Tomar Foto" para el reconocimiento facial</span>
            </div>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

export default App;