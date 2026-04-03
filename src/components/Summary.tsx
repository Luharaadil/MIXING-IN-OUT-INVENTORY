import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, ArrowDownRight, ArrowUpRight, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby69O24mOHRe6-V6EnwPR3u1HiY6MG1md8c0RjiGb5T5S5rE1omhj7_zObD8uqBMQDUww/exec';

interface ScanData {
  id: string;
  code: string;
  type: 'IN' | 'OUT';
  date: string;
  time: string;
}

export default function Summary() {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [scans, setScans] = useState<ScanData[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchScans = async () => {
      if (!selectedDate) return;

      setLoading(true);
      setErrorMsg(null);
      try {
        const response = await fetch(`${SCRIPT_URL}?date=${selectedDate}`, {
          method: 'GET',
          redirect: 'follow'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        setScans(data.scans || []);
      } catch (error: any) {
        console.error('Error fetching scans:', error);
        if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
          setErrorMsg('Failed to connect to Google Sheets. This usually means the Apps Script is not deployed with "Who has access: Anyone". Please redeploy the script and ensure "Anyone" is selected.');
        } else {
          setErrorMsg(`Error loading data: ${error.message}`);
        }
        setScans([]);
      } finally {
        setLoading(false);
      }
    };

    fetchScans();
  }, [selectedDate]);

  const totalIn = scans.filter(s => s.type === 'IN').length;
  const totalOut = scans.filter(s => s.type === 'OUT').length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Date Picker */}
      <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
          <Calendar className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Select Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full text-gray-900 font-medium outline-none bg-transparent"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-semibold">Connection Error</p>
            <p className="mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-600 rounded-full">
            <ArrowDownRight className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total IN</p>
            <p className="text-2xl font-bold text-gray-900">{totalIn}</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-full">
            <ArrowUpRight className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total OUT</p>
            <p className="text-2xl font-bold text-gray-900">{totalOut}</p>
          </div>
        </div>
      </div>

      {/* Scans List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50/50">
          <h3 className="font-medium text-gray-800">Scan History</h3>
        </div>
        
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : scans.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No scans found for this date.</div>
          ) : (
            // Reverse to show newest first
            [...scans].reverse().map((scan, index) => (
              <div key={scan.id || index} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "px-2 py-1 rounded text-xs font-bold",
                    scan.type === 'IN' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  )}>
                    {scan.type}
                  </div>
                  <span className="font-mono text-sm text-gray-900">{scan.code}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  {scan.time}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}




