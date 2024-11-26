import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Wand2, CornerDownLeft, Settings2, EyeIcon, EyeOffIcon, X } from "lucide-react";
import ModelSelector from "../components/ModelSelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Slider } from "../components/ui/slider";

const DEFAULT_ADVANCED_PARAMS = {
  temperature: 0.3,
  maxTokens: 2048,
  topK: 50,
  topP: 0.9,
  frequencyPenalty: 0.0,
};

function ChatPage() {
  const [inputText, setInputText] = useState('');
  const [summary, setSummary] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState(
    localStorage.getItem('llm_api_endpoint') || 'https://api.openai.com/v1/chat/completions'
  );
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isBullet, setIsBullet] = useState(false);
  const [category, setCategory] = useState('medium');
  const [parametersLoading, setParametersLoading] = useState(false);
  const [currentInstruction, setCurrentInstruction] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [selectedModel, setSelectedModel] = useState('');
  const [advancedParams, setAdvancedParams] = useState({
    temperature: 0.3,
    maxTokens: 2048,
    topK: 50,
    topP: 0.9,
    frequencyPenalty: 0.0,
  });
  const [completionTokens, setCompletionTokens] = useState(0);
  const [showHighlighting, setShowHighlighting] = useState(false);
  const [wordAnalysis, setWordAnalysis] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisCache, setAnalysisCache] = useState(new Map());
  const [generationTime, setGenerationTime] = useState(null);
  const [currentRequestId, setCurrentRequestId] = useState(null);

  // Save API endpoint to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('llm_api_endpoint', apiEndpoint);
  }, [apiEndpoint]);

  // Update instruction whenever parameters change
  useEffect(() => {
    setCurrentInstruction(getInstructionPrefix(isBullet, category));
  }, [isBullet, category]);

  const handleModelChange = (model) => {
    setSelectedModel(model);
  };

  const handleGenerateSummary = async () => {
    if (!inputText.trim() || !apiEndpoint) return;

    setIsLoading(true);
    setError(null);
    setSummary('');
    setCompletionTokens(0);
    setGenerationTime(null);
    const startTime = Date.now();

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input_text: inputText,
          api_endpoint: apiEndpoint,
          is_bullet: isBullet,
          summary_category: category,
          model: selectedModel,
          temperature: advancedParams.temperature,
          max_tokens: advancedParams.maxTokens,
          top_k: advancedParams.topK,
          top_p: advancedParams.topP,
          frequency_penalty: advancedParams.frequencyPenalty,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedSummary = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          setGenerationTime(Date.now() - startTime);
          break;
        }
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Extract request_id if present
              if (data.uid && !currentRequestId) {
                setCurrentRequestId(data.uid);
              }

              if (data.error) {
                setError(data.error);
                break;
              }

              // Handle completion message
              if (data.finish_reason === "stop" && data.usage?.completion_tokens) {
                setCompletionTokens(data.usage.completion_tokens);
                continue;
              }

              // Handle OpenAI streaming format
              if (data.choices?.[0]?.delta?.content) {
                const newContent = data.choices[0].delta.content;
                accumulatedSummary += newContent;
                setSummary(accumulatedSummary);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (err) {
      setError(err.message);
      console.error('Error generating summary:', err);
    } finally {
      setIsLoading(false);
      setCurrentRequestId(null);
    }
  };

  const handleCancelGeneration = async () => {
    if (!currentRequestId || !apiEndpoint) return;
    
    try {
      await fetch(`${API_URL}/chat/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_endpoint: apiEndpoint,
          request_id: currentRequestId
        })
      });
      
      setIsLoading(false);
      setCurrentRequestId(null);
    } catch (error) {
      console.error('Error cancelling generation:', error);
    }
  };

  // Replicate the instruction prefix logic from main.py
  const getInstructionPrefix = (isBullet, category) => {
    if (isBullet) {
      const numBulletPoints = 5; // Default value, could be made configurable
      switch (category) {
        case 'ultra_concise':
          return `Naredi ${numBulletPoints} kraih alinej iz besedila. Naj bodo izjemno kratke in jedrnate.`;
        case 'concise':
          return `Pretvori besedilo v ${numBulletPoints} alinej. Naj bodo kratke in jasne.`;
        case 'medium':
          return `Naredi ${numBulletPoints} alinej iz besedila z zmerno količino podrobnosti.`;
        case 'long':
          return `Razčleni besedilo v ${numBulletPoints} alinej z več podrobnostmi in razširjenimi pojasnili.`;
        default:
          return `Razvij ${numBulletPoints} alinej iz besedila, pri čemer vključuješ poglobljene informacije in podrobne razlage.`;
      }
    } else {
      switch (category) {
        case 'ultra_concise':
          return "Zgoščeno povzemite glavno idejo v eni sami, osrednji misli. Povzetek naj bo čim krajši.";
        case 'concise':
          return "Strnite bistvo v kratke in jedrnate povedi, izpostavljajoč najpomembnejše informacije.";
        case 'medium':
          return "Oblikujte povzetek, ki vključuje pomembne podrobnosti in argumente.";
        case 'long':
          return "Pripravite obširen povzetek, ki pokriva vse ključne vidike in informacije.";
        default:
          return "Ustvarite temeljit povzetek, ki podrobno povzema vse glavne točke, podatke in zaključke.";
      }
    }
  };

  // Add handler for Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerateSummary();
    }
  };

  const analyzeText = async (text) => {
    const cacheKey = `${inputText}_${text}`;
    
    if (analysisCache.has(cacheKey)) {
      setWordAnalysis(analysisCache.get(cacheKey));
      return;
    }

    try {
      setAnalysisLoading(true);
      const response = await fetch(`${API_URL}/analyze-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          original_text: inputText,
          summary_text: text
        })
      });
      
      const data = await response.json();
      setAnalysisCache(prev => new Map(prev).set(cacheKey, data.analysis));
      setWordAnalysis(data.analysis);
    } catch (error) {
      console.error('Error analyzing text:', error);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const getHighlightedText = () => {
    if (!showHighlighting || !wordAnalysis.length) return [summary];

    const result = [];
    let currentPos = 0;
    
    wordAnalysis.forEach((analysis) => {
      const word = analysis.word;
      const pos = summary.indexOf(word, currentPos);
      
      if (pos === -1) return;
      
      if (pos > currentPos) {
        result.push(summary.slice(currentPos, pos));
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
    
    if (currentPos < summary.length) {
      result.push(summary.slice(currentPos));
    }
    
    return result;
  };

  useEffect(() => {
    if (showHighlighting && summary) {
      analyzeText(summary);
    }
  }, [showHighlighting, summary]);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col h-[calc(100vh-2rem)] space-y-4">
          {/* Top section */}
          <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[42vh]">
            {/* Input Card */}
            <Card className="flex-1 lg:flex-[3] flex flex-col relative">
              <CardHeader className="py-2 border-b">
                <CardTitle className="text-xl font-semibold">Input Text</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-0 relative">
                <Textarea 
                  className="h-full w-full resize-none rounded-none border-0 focus:ring-0 text-sm"
                  style={{
                    fontFamily: 'inherit',
                    lineHeight: '1.5',
                  }}
                  placeholder="Enter your text here..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                />
                <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                  {countWords(inputText)} words
                </div>
              </CardContent>
            </Card>

            {/* Parameters Card */}
            <Card className="flex-1 lg:flex-[2] flex flex-col">
              <CardHeader className="py-2 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold">Parameters</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader className="flex flex-row items-center justify-between">
                      <DialogTitle>Advanced Parameters</DialogTitle>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setAdvancedParams(DEFAULT_ADVANCED_PARAMS)}
                        className="text-xs"
                      >
                        Reset to Default
                      </Button>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      {[
                        { 
                          label: "Temperature", 
                          key: "temperature", 
                          min: 0, 
                          max: 2, 
                          step: 0.1,
                          tooltip: "Controls randomness in the output" 
                        },
                        { 
                          label: "Max Tokens", 
                          key: "maxTokens", 
                          min: 1, 
                          max: 4096, 
                          step: 1,
                          tooltip: "Maximum length of generated text" 
                        },
                        { 
                          label: "Top K", 
                          key: "topK", 
                          min: 0, 
                          max: 100, 
                          step: 1,
                          tooltip: "Limits token consideration for sampling" 
                        },
                        { 
                          label: "Top P", 
                          key: "topP", 
                          min: 0, 
                          max: 1, 
                          step: 0.1,
                          tooltip: "Nucleus sampling threshold" 
                        },
                        { 
                          label: "Frequency Penalty", 
                          key: "frequencyPenalty", 
                          min: -2, 
                          max: 2, 
                          step: 0.1,
                          tooltip: "Penalizes frequent tokens" 
                        },
                      ].map((param) => (
                        <div key={param.key} className="grid gap-2">
                          <div className="flex justify-between">
                            <label className="text-sm font-medium">
                              {param.label}
                              <span className="ml-2 text-xs text-gray-500">
                                ({advancedParams[param.key]})
                              </span>
                            </label>
                            <span className="text-xs text-gray-500">{param.tooltip}</span>
                          </div>
                          <Slider
                            value={[advancedParams[param.key]]}
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            onValueChange={([value]) => 
                              setAdvancedParams(prev => ({
                                ...prev,
                                [param.key]: value
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="flex-grow p-2">
                <div className="h-full flex flex-col">
                  <div className="space-y-3">
                    {/* API Endpoint */}
                    <div className="w-full">
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        API Endpoint
                      </label>
                      <Input
                        type="url"
                        placeholder="Enter LLM API endpoint URL"
                        value={apiEndpoint}
                        onChange={(e) => setApiEndpoint(e.target.value)}
                        className="h-7 text-xs w-full"
                      />
                    </div>

                    {/* Model Selection */}
                    <div className="w-full">
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Model
                      </label>
                      <ModelSelector 
                        apiEndpoint={apiEndpoint}
                        onModelChange={handleModelChange}
                      />
                    </div>

                    {/* Type Selection */}
                    <div className="w-full">
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Type
                      </label>
                      <div className="flex gap-1.5">
                        <Button
                          variant={isBullet ? "default" : "outline"}
                          onClick={() => setIsBullet(true)}
                          className="flex-1 h-7 text-xs"
                          size="sm"
                        >
                          Bullet Points
                        </Button>
                        <Button
                          variant={!isBullet ? "default" : "outline"}
                          onClick={() => setIsBullet(false)}
                          className="flex-1 h-7 text-xs"
                          size="sm"
                        >
                          Paragraph
                        </Button>
                      </div>
                    </div>

                    {/* Length Selection */}
                    <div className="w-full">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-medium text-gray-700">Length</label>
                        <span className="text-xs text-gray-500">
                          {category === 'ultra_concise' ? 'Ultra Short' :
                           category === 'concise' ? 'Short' :
                           category === 'short' ? 'Brief' :
                           category === 'medium' ? 'Medium' :
                           category === 'long' ? 'Long' : 'Detailed'}
                        </span>
                      </div>
                      <Slider
                        value={[
                          category === 'ultra_concise' ? 0 :
                          category === 'concise' ? 20 :
                          category === 'short' ? 40 :
                          category === 'medium' ? 60 :
                          category === 'long' ? 80 : 100
                        ]}
                        min={0}
                        max={100}
                        step={20}
                        className="my-2"
                        onValueChange={([value]) => {
                          setCategory(
                            value === 0 ? 'ultra_concise' :
                            value === 20 ? 'concise' :
                            value === 40 ? 'short' :
                            value === 60 ? 'medium' :
                            value === 80 ? 'long' : 'detailed'
                          );
                        }}
                      />
                    
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary Card */}
          <Card className="h-auto lg:h-[42vh] flex flex-col">
            <CardHeader className="py-2 border-b">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl font-semibold">Generated Summary</CardTitle>
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
              {showHighlighting ? (
                <div 
                  className="h-full w-full p-2 overflow-auto whitespace-pre-wrap text-sm"
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
                      : summary 
                  }}
                />
              ) : (
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="h-full w-full resize-none rounded-none border-0 focus:ring-0 text-sm"
                  style={{
                    fontFamily: 'inherit',
                    lineHeight: '1.5',
                  }}
                  placeholder="Generated summary will appear here"
                  readOnly={isLoading}
                />
              )}
              <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                {countWords(summary)} words
                {!isLoading && completionTokens > 0 && generationTime && (
                  <> • {completionTokens} tokens • {(generationTime / 1000).toFixed(1)}s • {Math.round(completionTokens / (generationTime / 1000))} tokens/s</>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Footer with Generate Button */}
          <div className="flex justify-between items-center py-2">
            <div className="text-sm text-gray-600 font-medium">
              Compression: {inputText ? Math.round((1 - countWords(summary) / countWords(inputText)) * 100) : 0}%
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleGenerateSummary}
                className="w-48 h-10 text-sm gap-2"
                disabled={!apiEndpoint || !inputText.trim() || isLoading}
              >
                Generate
                <CornerDownLeft className="w-4 h-4" />
              </Button>

              {isLoading && (
                <Button 
                  onClick={handleCancelGeneration}
                  className="h-10 text-sm gap-2 bg-red-600 hover:bg-red-700"
                >
                  Cancel
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <Button
              onClick={() => {
                setInputText('');
                setSummary('');
              }}
              variant="outline"
              size="sm"
              className="text-sm"
            >
              Clear All
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

// Add the countWords function from SummaryPage
function countWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

export default ChatPage;
