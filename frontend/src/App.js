import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { ScrollArea } from "./components/ui/scroll-area";
import { Slider } from "./components/ui/slider";
import { Input } from "./components/ui/input";
import { EyeIcon, EyeOffIcon } from "lucide-react";

function getSimilarity(str1, str2) {
  // Additional Slovenian-specific endings
  const endings = [
    'ja', 'ju', 'je', 'ji', 'j',  // Basic cases
    'em', 'om', 'ih', 'im',       // Instrumental/Locative
    'ega', 'emu', 'imi',          // Adjective endings
    'ov', 'ev', 'ih', 'em'        // Possessive/Plural
  ];
  
  // Create stems by removing common endings
  const createStems = (str) => {
    let stems = [str];
    for (const ending of endings) {
      if (str.endsWith(ending)) {
        stems.push(str.slice(0, -ending.length));
      }
    }
    return stems;
  };
  
  const stems1 = createStems(str1);
  const stems2 = createStems(str2);
  
  // Check if any stem pairs match or are very similar
  return stems1.some(stem1 => 
    stems2.some(stem2 => {
      if (stem1 === stem2) return true;
      if (stem1.includes(stem2) || stem2.includes(stem1)) return true;
      
      const maxLength = Math.max(stem1.length, stem2.length);
      if (maxLength <= 3) return stem1 === stem2;
      
      // Calculate Levenshtein-like distance
      let distance = 0;
      const threshold = Math.floor(maxLength * 0.3); // 30% difference threshold
      
      for (let i = 0; i < Math.min(stem1.length, stem2.length); i++) {
        if (stem1[i] !== stem2[i]) distance++;
      }
      distance += Math.abs(stem1.length - stem2.length);
      
      return distance <= threshold;
    })
  );
}

function App() {
  const [summary, setSummary] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [sliderValues, setSliderValues] = useState({
    length: [50],
    creativity: [50],
  });
  const [loading, setLoading] = useState(true);
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [wordAnalysis, setWordAnalysis] = useState([]);
  const [showHighlighting, setShowHighlighting] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisCache, setAnalysisCache] = useState(new Map());

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

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    try {
      setChatLoading(true);
      const response = await axios.post(`${API_URL}/chat`, {
        message: chatInput,
        summary_id: summary.id,
        current_summary: summary.output,
        original_text: summary.input
      });

      setSummary(prev => ({
        ...prev,
        output: response.data.updated_summary
      }));
      setChatInput('');
    } catch (error) {
      console.error('Error processing chat:', error);
    } finally {
      setChatLoading(false);
    }
  };

  const analyzeText = async (text) => {
    // Create a cache key from both texts since analysis depends on both
    const cacheKey = `${summary.input}_${text}`;
    
    // Check cache first
    if (analysisCache.has(cacheKey)) {
      setWordAnalysis(analysisCache.get(cacheKey));
      return;
    }

    try {
      setAnalysisLoading(true);
      const response = await axios.post(`${API_URL}/analyze-text`, {
        original_text: summary.input,
        summary_text: text
      });
      
      // Store in cache
      setAnalysisCache(prev => new Map(prev).set(cacheKey, response.data.analysis));
      setWordAnalysis(response.data.analysis);
    } catch (error) {
      console.error('Error analyzing text:', error);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const getHighlightedText = () => {
    if (!showHighlighting || !wordAnalysis.length) return [summary.output];

    const result = [];
    let currentPos = 0;
    
    wordAnalysis.forEach((analysis, index) => {
      const word = analysis.word;
      const pos = summary.output.indexOf(word, currentPos);
      
      if (pos === -1) return; // Skip if word not found
      
      if (pos > currentPos) {
        result.push(summary.output.slice(currentPos, pos));
      }
      
      const className = analysis.found_in_original 
        ? 'bg-green-100 text-green-800 px-0.5 rounded' 
        : 'bg-red-100 text-red-800 px-0.5 rounded';
      
      result.push({
        props: {
          className,
          title: `${analysis.lemma} (${analysis.pos})`,
          children: word
        }
      });
      
      currentPos = pos + word.length;
    });
    
    if (currentPos < summary.output.length) {
      result.push(summary.output.slice(currentPos));
    }
    
    return result;
  };

  useEffect(() => {
    if (showHighlighting && summary?.output) {
      analyzeText(summary.output);
    }
  }, [showHighlighting, summary?.output]);

  useEffect(() => {
    setAnalysisCache(new Map());
  }, [currentPage]);

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
            <Card className="flex flex-col relative">
              <CardHeader className="py-2 border-b">
                <CardTitle className="text-xl font-semibold">Generated Summary</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-0">
                {chatLoading && (
                  <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                    <div className="text-lg">Updating...</div>
                  </div>
                )}
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
                <div className="flex justify-between items-center">
                  <CardTitle className="text-xl font-semibold">Your Summary</CardTitle>
                  <div className="flex items-center gap-2">
                    {analysisLoading && (
                      <div className="text-sm text-gray-500 animate-pulse">
                        Analyzing...
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowHighlighting(prev => !prev)}
                      className="p-1 h-8 w-8"
                      title={showHighlighting ? "Hide word matching" : "Show word matching"}
                      disabled={analysisLoading}
                    >
                      {showHighlighting ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow p-0 relative">
                {analysisLoading && showHighlighting && (
                  <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-500">Analyzing text...</span>
                    </div>
                  </div>
                )}
                {showHighlighting ? (
                  <div 
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => {
                      const newText = e.currentTarget.textContent;
                      if (newText !== summary.output) {
                        setSummary(prev => ({
                          ...prev,
                          output: newText
                        }));
                      }
                    }}
                    onBlur={(e) => {
                      const newText = e.currentTarget.textContent;
                      if (newText !== summary.output) {
                        analyzeText(newText);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className="h-full w-full p-2 overflow-auto whitespace-pre-wrap text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                    style={{
                      fontFamily: 'inherit',
                      lineHeight: '1.5',
                    }}
                    dangerouslySetInnerHTML={{ __html: 
                      wordAnalysis.length ? 
                        getHighlightedText().map(span => 
                          typeof span === 'string' ? span : 
                          `<span class="${span.props.className}" title="${span.props.title || ''}">${span.props.children}</span>`
                        ).join('') 
                        : summary.output 
                    }}
                  />
                ) : (
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
                )}
              </CardContent>
            </Card>
          </div>

            {/* Chat Interface */}
            <form onSubmit={handleChatSubmit} className="flex gap-2 items-center">
            <Input
              type="text"
              placeholder="Give me instructions to modify the summary..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-grow"
            />
            <Button 
              type="submit" 
              size="sm"
              disabled={chatLoading}
            >
              Send
            </Button>
          </form>

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