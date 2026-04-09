import React, { useState, useEffect, useRef } from 'react';
import { format, parseISO, differenceInDays, addDays, startOfDay, addHours } from 'date-fns';
import { Calendar, ArrowDownRight, ArrowUpRight, Clock, AlertTriangle, Filter, BarChart3, List, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { toPng } from 'html-to-image';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby69O24mOHRe6-V6EnwPR3u1HiY6MG1md8c0RjiGb5T5S5rE1omhj7_zObD8uqBMQDUww/exec';

interface ScanData {
  id: string;
  code: string;
  type: 'IN' | 'OUT';
  date: string;
  time: string;
  weight?: string;
  area?: string;
}

export default function Summary() {
  const [startDateTime, setStartDateTime] = useState<string>(format(addHours(startOfDay(new Date()), 7), 'yyyy-MM-dd\'T\'HH:mm'));
  const [endDateTime, setEndDateTime] = useState<string>(format(addHours(startOfDay(addDays(new Date(), 1)), 7), 'yyyy-MM-dd\'T\'HH:mm'));
  const [viewMode, setViewMode] = useState<'LIST' | 'SUMMARY'>('LIST');
  const [scans, setScans] = useState<ScanData[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterRubber, setFilterRubber] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterType, setFilterType] = useState<'' | 'IN' | 'OUT'>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const getScanDetails = (code: string) => {
    const parts = code.toUpperCase().split('-');
    const rubberName = parts[0] || '';
    const lotNumber = parts[1] || '';
    const batchStart = parseInt(parts[2] || '0');
    const batchEnd = parseInt(parts[3] || '0');
    const batchCount = batchEnd - batchStart + 1;
    return { rubberName, lotNumber, batchCount };
  };

  useEffect(() => {
    const fetchScans = async () => {
      if (!startDateTime || !endDateTime) return;

      const start = parseISO(startDateTime);
      const end = parseISO(endDateTime);
      
      if (start > end) {
        setErrorMsg("Start time cannot be after end time.");
        return;
      }
      
      setLoading(true);
      setErrorMsg(null);
      try {
        // For simplicity in this implementation, we fetch data for the date range
        // and filter by time client-side.
        const datesToFetch = [];
        let currentDate = new Date(start);
        while (currentDate <= end) {
          datesToFetch.push(format(currentDate, 'yyyy-MM-dd'));
          currentDate.setDate(currentDate.getDate() + 1);
        }

        const allScans: ScanData[] = [];
        
        const promises = datesToFetch.map(async (dateStr) => {
          const response = await fetch(`${SCRIPT_URL}?date=${dateStr}`, {
            method: 'GET',
            redirect: 'follow'
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          return data.scans || [];
        });

        const results = await Promise.all(promises);
        results.forEach(scans => allScans.push(...scans));

        // Filter by exact time range
        const filteredByTime = allScans.filter(scan => {
          try {
            // Try to parse date and time more robustly
            let scanDate = scan.date;
            // If date is in DD/MM/YYYY format, convert to YYYY-MM-DD
            if (scanDate.includes('/')) {
              const parts = scanDate.split('/');
              if (parts[0].length === 2 && parts[2].length === 4) {
                // Assume DD/MM/YYYY
                scanDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
              } else if (parts[0].length === 4) {
                // Assume YYYY/MM/DD
                scanDate = `${parts[0]}-${parts[1]}-${parts[2]}`;
              }
            }
            
            const scanDateTime = parseISO(`${scanDate}T${scan.time}`);
            if (isNaN(scanDateTime.getTime())) {
              console.warn('Invalid scan date/time:', scan.date, scan.time);
              return true; // Include it anyway if we can't parse it, to be safe
            }
            return scanDateTime >= start && scanDateTime <= end;
          } catch (e) {
            console.error('Error parsing scan date:', scan, e);
            return true;
          }
        });

        // Sort descending by date and time
        filteredByTime.sort((a, b) => {
          const strA = `${a.date} ${a.time}`;
          const strB = `${b.date} ${b.time}`;
          return strB.localeCompare(strA);
        });

        setScans(filteredByTime);
      } catch (error: any) {
        console.error('Error fetching scans:', error);
        setErrorMsg(`Error loading data: ${error.message}`);
        setScans([]);
      } finally {
        setLoading(false);
      }
    };

    fetchScans();
  }, [startDateTime, endDateTime, refreshKey]);

  const filteredScans = scans.filter(scan => {
    const { rubberName, lotNumber } = getScanDetails(scan.code);
    const area = scan.area || '';
    
    const matchRubber = filterRubber ? rubberName.toLowerCase().includes(filterRubber.toLowerCase()) : true;
    const matchBatch = filterBatch ? lotNumber.toLowerCase().includes(filterBatch.toLowerCase()) : true;
    const matchArea = filterArea ? area.toLowerCase().includes(filterArea.toLowerCase()) : true;
    const matchType = filterType ? scan.type === filterType : true;
    
    return matchRubber && matchBatch && matchArea && matchType;
  });

  const totalIn = filteredScans.filter(s => s.type === 'IN').length;
  const totalOut = filteredScans.filter(s => s.type === 'OUT').length;

  const rubberSummary = filteredScans.reduce((acc, scan) => {
    const { rubberName, batchCount } = getScanDetails(scan.code);
    acc[rubberName] = (acc[rubberName] || 0) + batchCount;
    return acc;
  }, {} as Record<string, number>);

  const summaryRef = useRef<HTMLDivElement>(null);

  const handleCopyPicture = async () => {
    if (summaryRef.current) {
      try {
        const dataUrl = await toPng(summaryRef.current, { backgroundColor: '#ffffff' });
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        alert('Summary copied to clipboard!');
      } catch (error) {
        console.error('Error copying picture:', error);
        alert('Failed to copy picture.');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Date/Time Picker */}
      <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-500 mb-1">Start Time</label>
          <input
            type="datetime-local"
            value={startDateTime}
            onChange={(e) => setStartDateTime(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
          />
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-500 mb-1">End Time</label>
          <input
            type="datetime-local"
            value={endDateTime}
            onChange={(e) => setEndDateTime(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
          />
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex flex-1 bg-gray-200 p-1 rounded-lg">
          <button 
            onClick={() => setViewMode('LIST')}
            className={cn("flex-1 py-2 text-sm font-medium rounded-md flex items-center justify-center gap-2", viewMode === 'LIST' ? "bg-white shadow text-blue-600" : "text-gray-600")}
          >
            <List className="w-4 h-4" /> List View
          </button>
          <button 
            onClick={() => setViewMode('SUMMARY')}
            className={cn("flex-1 py-2 text-sm font-medium rounded-md flex items-center justify-center gap-2", viewMode === 'SUMMARY' ? "bg-white shadow text-blue-600" : "text-gray-600")}
          >
            <BarChart3 className="w-4 h-4" /> Rubber Summary
          </button>
        </div>
        <button 
          onClick={() => setRefreshKey(prev => prev + 1)}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Clock className={cn("w-4 h-4", loading && "animate-spin")} />
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Filters (only in List View) */}
      {viewMode === 'LIST' && (
        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filters
            </h3>
            <button 
              onClick={() => {
                setFilterRubber('');
                setFilterBatch('');
                setFilterArea('');
                setFilterType('');
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              Clear All Filters
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Filter Type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as '' | 'IN' | 'OUT')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="">All</option>
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Filter Rubber</label>
              <input type="text" value={filterRubber} onChange={(e) => setFilterRubber(e.target.value)} placeholder="e.g. 0022NP" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Filter Batch</label>
              <input type="text" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)} placeholder="e.g. 2903266307" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Filter Area</label>
              <input type="text" value={filterArea} onChange={(e) => setFilterArea(e.target.value)} placeholder="e.g. M-B-1" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
        </div>
      )}

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

      {/* Scans List / Summary */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {viewMode === 'LIST' ? (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : filteredScans.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No scans found matching your criteria.</div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Rubber</th>
                    <th className="px-4 py-3 font-medium">Barcode</th>
                    <th className="px-4 py-3 font-medium">Weight</th>
                    <th className="px-4 py-3 font-medium">Area</th>
                    <th className="px-4 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredScans.map((scan, index) => {
                    const { rubberName } = getScanDetails(scan.code);
                    return (
                      <tr key={scan.id || index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className={cn("px-2 py-1 rounded text-[10px] font-bold", scan.type === 'IN' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                            {scan.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{rubberName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{scan.code}</td>
                        <td className="px-4 py-3 text-gray-700">{scan.weight || '-'}</td>
                        <td className="px-4 py-3 text-gray-700">{scan.area || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{scan.date} <br/> {scan.time}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="p-4" ref={summaryRef}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-gray-800">Rubber Batch Summary</h3>
              <button 
                onClick={handleCopyPicture}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Copy className="w-3 h-3" /> Copy Picture
              </button>
            </div>
            <div className="space-y-2">
              {Object.entries(rubberSummary).map(([rubber, count]) => (
                <div key={rubber} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium text-gray-900">{rubber}</span>
                  <span className="font-bold text-blue-600">{count}</span>
                </div>
              ))}
              {Object.keys(rubberSummary).length === 0 && (
                <div className="text-center text-gray-500 py-4">No data available.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}




