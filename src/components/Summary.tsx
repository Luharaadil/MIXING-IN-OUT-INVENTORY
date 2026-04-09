import React, { useState, useEffect, useRef } from 'react';
import { format, parseISO, differenceInDays, addDays, startOfDay, addHours } from 'date-fns';
import { Calendar, ArrowDownRight, ArrowUpRight, Clock, AlertTriangle, Filter, BarChart3, List, Copy, FileSpreadsheet } from 'lucide-react';
import { cn } from '../lib/utils';
import { toPng } from 'html-to-image';
import * as XLSX from 'xlsx';

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
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [dataSource, setDataSource] = useState<'CLOUD' | 'LOCAL'>('CLOUD');
  const [fileHandle, setFileHandle] = useState<any>(null);

  const getScanDetails = (code: string) => {
    const parts = code.toUpperCase().split('-');
    const rubberName = parts[0] || '';
    const lotNumber = parts[1] || '';
    const batchStart = parseInt(parts[2] || '0');
    const batchEnd = parseInt(parts[3] || '0');
    const batchCount = batchEnd - batchStart + 1;
    return { rubberName, lotNumber, batchCount };
  };

  const parseScanDateTime = (dateStr: string, timeStr: string) => {
    try {
      if (!dateStr || !timeStr) return null;

      let normalizedDate = dateStr;
      if (normalizedDate.includes('/')) {
        const parts = normalizedDate.split('/');
        // Handle DD/MM/YYYY or YYYY/MM/DD
        if (parts[0].length === 2 && parts[2].length === 4) {
          normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (parts[0].length === 4) {
          normalizedDate = `${parts[0]}-${parts[1]}-${parts[2]}`;
        }
      }
      
      let cleanTime = timeStr.trim();
      
      // Handle Excel time numbers (e.g. "0.2916666666666667" for 7:00 AM)
      if (!isNaN(Number(cleanTime)) && Number(cleanTime) < 1 && Number(cleanTime) >= 0) {
        const totalSeconds = Math.round(Number(cleanTime) * 24 * 3600);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        cleanTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      
      // Try parsing with space
      const dt = new Date(`${normalizedDate} ${cleanTime}`);
      if (!isNaN(dt.getTime())) return dt;
      
      // Try parsing with T
      const dtT = new Date(`${normalizedDate}T${cleanTime}`);
      if (!isNaN(dtT.getTime())) return dtT;

      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const fetchScans = async () => {
      const start = parseISO(startDateTime);
      const end = parseISO(endDateTime);

      if (dataSource === 'LOCAL') {
        if (!fileHandle) return;
        setLoading(true);
        setErrorMsg(null);
        try {
          const file = await fileHandle.getFile();
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer);
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          // Data starts at row 4 (index 3) according to the image
          const dataRows = jsonData.slice(3);

          const mappedScans: ScanData[] = dataRows
            .filter(row => row && row[1]) // Ensure row exists and has a barcode in column B
            .map((row, index) => {
              const code = String(row[1] || '').trim().toUpperCase();
              const weight = String(row[2] || '').trim();
              // Column 5 (Index 4) is Rubber Name (recipe_name)
              // Column 7 (Index 6) or Column 6 (Index 5) for time
              const rawTime = String(row[6] || row[5] || '').trim();
              
              let date = format(new Date(), 'yyyy-MM-dd');
              let time = '00:00';
              
              if (rawTime) {
                // Handle YYYY/MM/DD HH:mm format seen in image
                if (rawTime.includes(' ')) {
                  const [d, t] = rawTime.split(' ');
                  date = d.replace(/\//g, '-');
                  time = t;
                } else if (rawTime.includes('T')) {
                  const [d, t] = rawTime.split('T');
                  date = d;
                  time = t.split('.')[0];
                } else {
                  time = rawTime;
                }
              }

              return {
                id: `local-${index}`,
                code: code,
                type: 'IN', // Assuming these are IN records based on the "Usage" context
                date: date,
                time: time,
                weight: weight,
                area: '' 
              };
            });

          // Filter by time range if dates are valid
          const filteredLocal = mappedScans.filter(scan => {
            const scanDateTime = parseScanDateTime(scan.date, scan.time);
            if (!scanDateTime) return true;
            return scanDateTime >= start && scanDateTime <= end;
          });

          filteredLocal.sort((a, b) => {
            const dtA = parseScanDateTime(a.date, a.time);
            const dtB = parseScanDateTime(b.date, b.time);
            return (dtB?.getTime() || 0) - (dtA?.getTime() || 0);
          });
          setScans(filteredLocal);
        } catch (error: any) {
          console.error('Error reading local file:', error);
          setErrorMsg(`Error reading local file: ${error.message}`);
        } finally {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      try {
        // Fetch data for all days in the range
        const datesToFetch = [];
        let currentDate = startOfDay(start);
        const endLimit = startOfDay(end);
        
        while (currentDate <= endLimit) {
          datesToFetch.push(format(currentDate, 'yyyy-MM-dd'));
          currentDate = addDays(currentDate, 1);
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
          const scanDateTime = parseScanDateTime(scan.date, scan.time);
          if (!scanDateTime) return true;
          return scanDateTime >= start && scanDateTime <= end;
        });

        // Sort descending by actual date object
        filteredByTime.sort((a, b) => {
          const dtA = parseScanDateTime(a.date, a.time);
          const dtB = parseScanDateTime(b.date, b.time);
          return (dtB?.getTime() || 0) - (dtA?.getTime() || 0);
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
  }, [startDateTime, endDateTime, refreshKey, dataSource, fileHandle]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        setRefreshKey(prev => prev + 1);
      }, 3 * 60 * 1000); // 3 minutes
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

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

  const inventorySummary = filteredScans.reduce((acc, scan) => {
    const { rubberName, batchCount } = getScanDetails(scan.code);
    if (!acc[rubberName]) {
      acc[rubberName] = { in: 0, out: 0, balance: 0, barcodes: [] as { code: string; weight?: string; date: string }[] };
    }
    
    if (scan.type === 'IN') {
      acc[rubberName].in += batchCount;
      acc[rubberName].balance += batchCount;
      acc[rubberName].barcodes.push({ code: scan.code, weight: scan.weight, date: scan.date });
    } else {
      acc[rubberName].out += batchCount;
      acc[rubberName].balance -= batchCount;
      // When OUT, we remove the corresponding IN barcode if it exists in the list
      const idx = acc[rubberName].barcodes.findIndex(b => b.code === scan.code);
      if (idx !== -1) {
        acc[rubberName].barcodes.splice(idx, 1);
      }
    }
    return acc;
  }, {} as Record<string, { in: number; out: number; balance: number; barcodes: { code: string; weight?: string; date: string }[] }>);

  const summaryRef = useRef<HTMLDivElement>(null);
  const [expandedRubber, setExpandedRubber] = useState<string | null>(null);

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

  const handleSelectLocalFile = async () => {
    try {
      // @ts-ignore - File System Access API
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Excel Files',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              'application/vnd.ms-excel': ['.xls']
            }
          }
        ],
        multiple: false
      });
      setFileHandle(handle);
      setDataSource('LOCAL');
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error selecting file:', error);
        alert('Failed to select file. Make sure your browser supports the File System Access API.');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Data Source Toggle */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Data Source</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => setDataSource('CLOUD')}
              className={cn(
                "flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all",
                dataSource === 'CLOUD' ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              Google Sheets (Cloud)
            </button>
            <button 
              onClick={handleSelectLocalFile}
              className={cn(
                "flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2",
                dataSource === 'LOCAL' ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {fileHandle ? 'Local Excel (Active)' : 'Select Local Excel'}
            </button>
          </div>
          {dataSource === 'LOCAL' && fileHandle && (
            <p className="text-[10px] text-gray-500 mt-2 italic">
              Connected to: {fileHandle.name}. App will re-read this file every 3 mins if auto-refresh is on.
            </p>
          )}
        </div>
      </div>

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

      <div className="flex items-center gap-2 px-1">
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ml-3 text-xs font-medium text-gray-600">Auto-refresh (3 min)</span>
        </label>
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
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-bold text-lg text-gray-800">Inventory Summary</h3>
                <p className="text-xs text-gray-500">Remaining stock by rubber type</p>
              </div>
              <button 
                onClick={handleCopyPicture}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Copy className="w-3 h-3" /> Copy Picture
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-4 text-[10px] font-bold text-gray-400 uppercase px-4 mb-1">
                <div className="col-span-1">Rubber Name</div>
                <div className="text-center">Total IN</div>
                <div className="text-center">Total OUT</div>
                <div className="text-right">Balance</div>
              </div>

              {Object.entries(inventorySummary).map(([rubber, data]) => {
                const inv = data as { in: number; out: number; balance: number; barcodes: { code: string; weight?: string; date: string }[] };
                return (
                  <div key={rubber} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                    <div 
                      onClick={() => setExpandedRubber(expandedRubber === rubber ? null : rubber)}
                      className={cn(
                        "grid grid-cols-4 items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors",
                        expandedRubber === rubber && "bg-blue-50/30"
                      )}
                    >
                      <div className="col-span-1 font-bold text-gray-900 flex items-center gap-2">
                        <div className={cn("w-1.5 h-1.5 rounded-full", inv.balance > 0 ? "bg-green-500" : "bg-gray-300")} />
                        {rubber}
                      </div>
                      <div className="text-center text-sm font-medium text-green-600">+{inv.in}</div>
                      <div className="text-center text-sm font-medium text-red-600">-{inv.out}</div>
                      <div className="text-right text-base font-black text-blue-700">{inv.balance}</div>
                    </div>

                    {expandedRubber === rubber && (
                      <div className="bg-gray-50 border-t p-4 space-y-3">
                        <div className="flex justify-between items-center border-b pb-2">
                          <h4 className="text-xs font-bold text-gray-600 uppercase">Remaining Barcodes</h4>
                          <span className="text-[10px] bg-white px-2 py-0.5 rounded border text-gray-500">
                            {inv.barcodes.length} items
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                          {inv.barcodes.length > 0 ? (
                            inv.barcodes.map((b, i) => (
                              <div key={i} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm text-xs">
                                <div className="flex flex-col">
                                  <span className="font-mono font-bold text-gray-800">{b.code}</span>
                                  <span className="text-[10px] text-gray-400">{b.date}</span>
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-blue-600">{b.weight || '-'} kg</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-4 text-xs text-gray-400 italic">No remaining barcodes in inventory</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {Object.keys(inventorySummary).length === 0 && (
                <div className="text-center text-gray-500 py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                  <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No inventory data available for the selected period.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}




