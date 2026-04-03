import React, { useState } from 'react';
import Scanner from './components/Scanner';
import Summary from './components/Summary';
import { ScanLine, BarChart3 } from 'lucide-react';
import { cn } from './lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'SUMMARY'>('SCANNER');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-lg">
            <ScanLine className="w-6 h-6" />
            <span>MIXING IN-OUT INVENTORY</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {activeTab === 'SCANNER' && <Scanner />}
        {activeTab === 'SUMMARY' && <Summary />}
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t fixed bottom-0 left-0 right-0 pb-safe">
        <div className="max-w-2xl mx-auto flex">
          <button
            onClick={() => setActiveTab('SCANNER')}
            className={cn(
              "flex-1 py-4 flex flex-col items-center gap-1 text-xs font-medium transition-colors",
              activeTab === 'SCANNER' ? "text-blue-600" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <ScanLine className="w-6 h-6" />
            Scan
          </button>
          <button
            onClick={() => setActiveTab('SUMMARY')}
            className={cn(
              "flex-1 py-4 flex flex-col items-center gap-1 text-xs font-medium transition-colors",
              activeTab === 'SUMMARY' ? "text-blue-600" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <BarChart3 className="w-6 h-6" />
            Summary
          </button>
        </div>
      </nav>
    </div>
  );
}



