import React, { useState } from 'react';
import SummaryPage from './pages/SummaryPage';
import ChatPage from './pages/ChatPage';
import { Button } from "./components/ui/button";

function App() {
  const [currentView, setCurrentView] = useState('chat');

  return (
    <div>
      {/* Navigation Bar */}
      <div className="bg-white border-b">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex space-x-4">
              <Button
                variant={currentView === 'summary' ? 'default' : 'ghost'}
                onClick={() => setCurrentView('summary')}
              >
                Summary
              </Button>
              <Button
                variant={currentView === 'chat' ? 'default' : 'ghost'}
                onClick={() => setCurrentView('chat')}
              >
                Chat
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {currentView === 'summary' ? (
        <SummaryPage />
      ) : (
        <ChatPage />
      )}
    </div>
  );
}

export default App;