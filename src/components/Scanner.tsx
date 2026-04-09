import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { format } from 'date-fns';
import { Camera, Keyboard, LogIn, LogOut, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby69O24mOHRe6-V6EnwPR3u1HiY6MG1md8c0RjiGb5T5S5rE1omhj7_zObD8uqBMQDUww/exec';

type ScanType = 'IN' | 'OUT';
type ScannerMode = 'CAMERA' | 'HARDWARE';

interface LastScanData {
  code: string;
  type: ScanType;
  time: Date;
  weight: string;
  area: string;
}

export default function Scanner() {
  const [scanType, setScanType] = useState<ScanType>('IN');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('HARDWARE');
  const [lastScan, setLastScan] = useState<LastScanData | null>(null);
  const [hardwareInput, setHardwareInput] = useState('');
  const [weight, setWeight] = useState('');
  const [area, setArea] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanModal, setScanModal] = useState<{message: string, isError: boolean} | null>(null);
  const [todayScans, setTodayScans] = useState<{code: string, type: ScanType}[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch today's scans for duplicate checking
  useEffect(() => {
    const fetchTodayScans = async () => {
      try {
        const dateStr = format(new Date(), 'yyyy-MM-dd');
        const response = await fetch(`${SCRIPT_URL}?date=${dateStr}`);
        if (response.ok) {
          const data = await response.json();
          const normalizedScans = (data.scans || []).map((s: any) => ({
            ...s,
            code: (s.code || '').toUpperCase()
          }));
          setTodayScans(normalizedScans);
        }
      } catch (error) {
        console.error('Failed to fetch today scans:', error);
      }
    };
    fetchTodayScans();
  }, []);

  // Initialize Camera Scanner
  useEffect(() => {
    if (scannerMode === 'CAMERA') {
      const scanner = new Html5QrcodeScanner(
        'reader',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        (decodedText) => {
          handleScan(decodedText);
        },
        (error) => {
          // ignore background errors
        }
      );

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [scannerMode, scanType, weight, area]); // Added weight and area to dependencies so they are captured correctly

  const scanTypeRef = useRef(scanType);
  const weightRef = useRef(weight);
  const areaRef = useRef(area);
  
  useEffect(() => {
    scanTypeRef.current = scanType;
    weightRef.current = weight;
    areaRef.current = area;
    setErrorMsg(null);
  }, [scanType, weight, area]);

  const handleScan = async (code: string) => {
    const uppercasedCode = code.trim().toUpperCase();
    if (!uppercasedCode || isSubmitting || scanModal) return false;

    const currentType = scanTypeRef.current;
    const currentWeight = weightRef.current;
    const currentArea = areaRef.current;

    if (currentType === 'IN') {
      const missing = [];
      if (!currentWeight.trim()) missing.push('weight');
      if (!currentArea.trim()) missing.push('area');
      
      if (missing.length > 0) {
        setScanModal({ message: `Please provide ${missing.join(' and ')} for IN material.`, isError: true });
        return false;
      }
    }

    const isDuplicate = todayScans.some(s => s.code === uppercasedCode && s.type === currentType);
    if (isDuplicate) {
      setScanModal({ message: `Barcode ${uppercasedCode} is already marked as ${currentType}.`, isError: true });
      return false;
    }

    const now = new Date();
    const dateStr = format(now, 'yyyy-MM-dd');
    const timeStr = format(now, 'HH:mm:ss');
    
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      // Use text/plain to avoid CORS preflight issues with Google Apps Script
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          date: dateStr,
          time: timeStr,
          type: currentType,
          code: uppercasedCode,
          weight: currentWeight,
          area: currentArea
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setTodayScans(prev => [...prev, { code: uppercasedCode, type: currentType }]);
      
      if (scannerMode === 'CAMERA') {
        const msg = currentType === 'IN' 
          ? `${uppercasedCode} and ${currentWeight || '0'} of this material in inward in this ${currentArea || 'area'} successfully`
          : `out ${uppercasedCode} successful`;
        setScanModal({ message: msg, isError: false });
      } else {
        setLastScan({ 
          code: uppercasedCode, 
          type: currentType, 
          time: now,
          weight: currentWeight,
          area: currentArea
        });
      }
      
      // Clear weight and area after successful IN scan
      if (currentType === 'IN') {
        setWeight('');
        setArea('');
      }
      
      return true;
    } catch (error: any) {
      console.error('Error saving scan:', error);
      const msg = error.message === 'Failed to fetch' || error.message.includes('NetworkError')
        ? 'Failed to connect to Google Sheets. Please ensure the Apps Script is deployed with "Who has access: Anyone".'
        : `Failed to save scan: ${error.message}`;
      
      setScanModal({ message: msg, isError: true });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardwareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleScan(hardwareInput);
    if (success) {
      setHardwareInput('');
    }
    inputRef.current?.focus();
  };

  // Keep hardware input focused
  useEffect(() => {
    if (scannerMode === 'HARDWARE') {
      inputRef.current?.focus();
    }
  }, [scannerMode]);

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div className="bg-white rounded-xl shadow-sm border p-4 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Scan Operation</h2>
        
        {/* IN / OUT Toggle */}
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setScanType('IN')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors",
              scanType === 'IN' ? "bg-white text-green-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <LogIn className="w-4 h-4" /> IN
          </button>
          <button
            onClick={() => setScanType('OUT')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors",
              scanType === 'OUT' ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <LogOut className="w-4 h-4" /> OUT
          </button>
        </div>

        {/* Additional Details */}
        {scanType === 'IN' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Weight</label>
              <input
                type="text"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g. 50kg"
                className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Area</label>
              <input
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Zone A"
                className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
          </div>
        )}

        {/* Scanner Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setScannerMode('HARDWARE')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 border rounded-lg text-sm font-medium transition-colors",
              scannerMode === 'HARDWARE' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            <Keyboard className="w-4 h-4" /> Barcode Scanner
          </button>
          <button
            onClick={() => setScannerMode('CAMERA')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 border rounded-lg text-sm font-medium transition-colors",
              scannerMode === 'CAMERA' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            <Camera className="w-4 h-4" /> Mobile Camera
          </button>
        </div>
      </div>

      {/* Scanner Area */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {scannerMode === 'CAMERA' ? (
          <div className="p-4">
            <div id="reader" className="w-full rounded-lg overflow-hidden"></div>
            <p className="text-xs text-center text-gray-500 mt-4">
              Point your camera at a QR code or Barcode
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <Keyboard className="w-6 h-6" />
              </div>
              <h3 className="font-medium text-gray-900">Ready to Scan</h3>
              <p className="text-sm text-gray-500">
                Use your Zebra/Symbol scanner. Ensure the input field below is focused.
              </p>
            </div>
            
            <form onSubmit={handleHardwareSubmit} className="flex flex-col gap-3">
              <input
                ref={inputRef}
                type="text"
                value={hardwareInput}
                onChange={(e) => setHardwareInput(e.target.value)}
                placeholder="Scan barcode here..."
                disabled={isSubmitting}
                className="w-full px-4 py-3 text-center text-lg border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all disabled:opacity-50"
                autoFocus
              />
              {hardwareInput && (
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  Submit Scan
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Last Scan Status */}
      {lastScan && !errorMsg && scannerMode === 'HARDWARE' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-900">
              {lastScan.type === 'IN' 
                ? `${lastScan.code} and ${lastScan.weight || '0'} of this material in inward in this ${lastScan.area || 'area'} successfully`
                : `out ${lastScan.code} successful`
              }
            </p>
            <p className="text-xs text-green-600/80 mt-1">
              {lastScan.time.toLocaleTimeString()}
            </p>
          </div>
        </div>
      )}

      {/* Custom Modal */}
      {scanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 text-center animate-in zoom-in-95">
            <div className={cn("mx-auto w-12 h-12 rounded-full flex items-center justify-center", scanModal.isError ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600")}>
              {scanModal.isError ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {scanModal.isError ? 'Attention' : 'Success'}
            </h3>
            <p className="text-gray-600 text-sm">
              {scanModal.message}
            </p>
            <button
              onClick={() => setScanModal(null)}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

