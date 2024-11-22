import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { ScrollArea } from "./components/ui/scroll-area";
import { Slider } from "./components/ui/slider";

function App() {
  const [summary, setSummary] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [sliderValues, setSliderValues] = useState({
    length: [50],
    creativity: [50],
  });
  const [loading, setLoading] = useState(true);
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetchSummary();
  }, [currentPage]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_URL}/summaries/?skip=${currentPage}&limit=1`
      );
      setSummary(response.data[0]);
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSummaryUpdate = async (id, newSummary) => {
    try {
      await axios.put(`${API_URL}/summaries/${id}`, {
        summary: newSummary
      });
      await fetchSummary();
    } catch (error) {
      console.error('Error updating summary:', error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="container mx-auto h-screen flex items-center justify-center">
        <div className="text-lg">No more summaries available.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col h-[calc(100vh-2rem)] space-y-4">
          
          {/* Top section - reduced height */}
          <div className="flex flex-col md:flex-row gap-4 h-[42vh]">
            {/* Input text card */}
            <Card className="flex-[2] flex flex-col">
              <CardHeader className="py-2 border-b">
                <CardTitle className="text-xl font-semibold">Input Text</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-0">
                <Textarea 
                  className="h-full w-full resize-none rounded-none border-0 focus:ring-0" 
                  value={summary.input}
                  aria-label="Input text"
                  onChange={(e) => {
                    setSummary(prev => ({
                      ...prev,
                      input: e.target.value
                    }));
                  }}
                />
              </CardContent>
            </Card>

            {/* Parameters card */}
            <Card className="flex-1 flex flex-col">
              <CardHeader className="py-2 border-b">
                <CardTitle className="text-xl font-semibold">Parameters</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-3 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Summary Length: {sliderValues.length}%
                    </label>
                    <Slider
                      value={sliderValues.length}
                      onValueChange={(value) => 
                        setSliderValues(prev => ({ ...prev, length: value }))
                      }
                      max={100}
                      step={1}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Creativity: {sliderValues.creativity}%
                    </label>
                    <Slider
                      value={sliderValues.creativity}
                      onValueChange={(value) => 
                        setSliderValues(prev => ({ ...prev, creativity: value }))
                      }
                      max={100}
                      step={1}
                    />
                  </div>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="text-gray-500">
                    <span className="font-medium">Words: </span>
                    {summary.num_words}
                  </div>
                  <div className="text-gray-500">
                    <span className="font-medium">Type: </span>
                    {summary.is_bullet ? 'Bullet Points' : 'Paragraph'}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom section - reduced height */}
          <div className="grid md:grid-cols-2 gap-4 h-[42vh]">
            {/* Generated Summary */}
            <Card className="flex flex-col">
              <CardHeader className="py-2 border-b">
                <CardTitle className="text-xl font-semibold">Generated Summary</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-0">
                <Textarea
                  value={summary.output}
                  className="h-full w-full resize-none rounded-none border-0 focus:ring-0"
                  aria-label="Generated summary"
                  onChange={(e) => {
                    setSummary(prev => ({
                      ...prev,
                      output: e.target.value
                    }));
                  }}
                />
              </CardContent>
            </Card>

            {/* User Summary Card */}
            <Card className="flex flex-col">
              <CardHeader className="py-2 border-b">
                <CardTitle className="text-xl font-semibold">Your Summary</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-0">
                <Textarea
                  value={summary.output}
                  className="h-full w-full resize-none rounded-none border-0 focus:ring-0"
                  aria-label="Your summary"
                  onChange={(e) => {
                    setSummary(prev => ({
                      ...prev,
                      output: e.target.value
                    }));
                  }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Navigation - reduced padding */}
          <div className="flex justify-between items-center py-2">
            <div className="text-sm text-gray-600 font-medium">
              Summary {currentPage + 1}
            </div>
            <div className="text-sm text-gray-500 font-medium">
              LLARA RLHF
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(prev => prev - 1)}
                aria-label="Previous summary"
              >
                Previous
              </Button>
              <Button
                onClick={() => handleSummaryUpdate(summary.id, summary.output)}
                variant="default"
                size="sm"
                aria-label="Save changes"
              >
                Save Changes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => prev + 1)}
                aria-label="Next summary"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;