import React, { useState, useEffect } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Calendar, ArrowDownRight, ArrowUpRight, Clock, AlertTriangle, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

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
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [scans, setScans] = useState<ScanData[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterRubber, setFilterRubber] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterType, setFilterType] = useState<'' | 'IN' | 'OUT'>('');

  useEffect(() => {
    const fetchScans = async () => {
      if (!startDate || !endDate) return;

      const start = parseISO(startDate);
      const end = parseISO(endDate);
      
      if (start > end) {
        setErrorMsg("Start date cannot be after end date.");
        return;
      }
      
      if (differenceInDays(end, start) > 31) {
        setErrorMsg("Please select a date range of 31 days or less.");
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      try {
        const datesToFetch = [];
        let currentDate = new Date(start);
        while (currentDate <= end) {
          datesToFetch.push(format(currentDate, 'yyyy-MM-dd'));
          currentDate.setDate(currentDate.getDate() + 1);
        }

        const allScans: ScanData[] = [];
        
        // Fetch all dates in parallel
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

        // Sort descending by date and time
        allScans.sort((a, b) => {
          const strA = `${a.date} ${a.time}`;
          const strB = `${b.date} ${b.time}`;
          return strB.localeCompare(strA);
        });

        setScans(allScans);
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
  }, [startDate, endDate]);

  const totalIn = scans.filter(s => s.type === 'IN').length;
  const totalOut = scans.filter(s => s.type === 'OUT').length;

  const filteredScans = scans.filter(scan => {
    const parts = scan.code.split('-');
    const rubberName = parts[0] || '';
    const batchNumber = parts[1] || '';
    const area = scan.area || '';
    
    const matchRubber = filterRubber ? rubberName.toLowerCase().includes(filterRubber.toLowerCase()) : true;
    const matchBatch = filterBatch ? batchNumber.toLowerCase().includes(filterBatch.toLowerCase()) : true;
    const matchArea = filterArea ? area.toLowerCase().includes(filterArea.toLowerCase()) : true;
    const matchType = filterType ? scan.type === filterType : true;
    
    return matchRubber && matchBatch && matchArea && matchType;
  });

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Date Picker */}
      <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-gray-900 font-medium outline-none bg-transparent text-sm"
            />
          </div>
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-gray-900 font-medium outline-none bg-transparent text-sm"
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter Type</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as '' | 'IN' | 'OUT')}
            className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm bg-white"
          >
            <option value="">All</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter Rubber Name</label>
          <input
            type="text"
            value={filterRubber}
            onChange={(e) => setFilterRubber(e.target.value)}
            placeholder="e.g. 0022NP"
            className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter Batch No.</label>
          <input
            type="text"
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
            placeholder="e.g. 2903266307"
            className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter Area</label>
          <input
            type="text"
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            placeholder="e.g. M-B-1"
            className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
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
        <div className="px-4 py-3 border-b bg-gray-50/50 flex items-center justify-between">
          <h3 className="font-medium text-gray-800">Scan History</h3>
          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">{filteredScans.length} records</span>
        </div>
        
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
                  const parts = scan.code.split('-');
                  const rubberName = parts[0] || '-';
                  
                  return (
                    <tr key={scan.id || index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold",
                          scan.type === 'IN' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        )}>
                          {scan.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{rubberName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{scan.code}</td>
                      <td className="px-4 py-3 text-gray-700">{scan.weight || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{scan.area || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {scan.date} <br/> {scan.time}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}




