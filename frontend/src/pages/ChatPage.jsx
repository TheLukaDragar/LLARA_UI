import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Wand2, CornerDownLeft } from "lucide-react";
import ModelSelector from "../components/ModelSelector";

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
    setSummary(''); // Clear existing summary

    try {
      const instruction = getInstructionPrefix(isBullet, category);
      
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
          instruction_prefix: instruction,
          temperature: temperature,
          max_tokens: maxTokens,
          model: selectedModel
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
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.error) {
                setError(data.error);
                break;
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

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col h-[calc(100vh-2rem)] space-y-4">
          {/* Top section */}
          <div className="flex flex-col md:flex-row gap-4 h-[42vh]">
            {/* Input Card */}
            <Card className="flex-[3] flex flex-col relative">
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
            <Card className="flex-[2] flex flex-col">
              <CardHeader className="py-2 border-b">
                <CardTitle className="text-lg font-semibold">Parameters</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-2">
                <div className="h-full flex flex-col">
                  <div className="space-y-2">
                    {/* API Endpoint */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">API Endpoint</label>
                      <Input
                        type="url"
                        placeholder="Enter LLM API endpoint URL"
                        value={apiEndpoint}
                        onChange={(e) => setApiEndpoint(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>

                    {/* Model Selection */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">Model</label>
                      <ModelSelector 
                        apiEndpoint={apiEndpoint}
                        onModelChange={handleModelChange}
                      />
                    </div>

                    {/* Type Selection */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">Type</label>
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
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">Length</label>
                      <div className="flex gap-1">
                        {[
                          ['ultra_concise', 'Very Short'],
                          ['concise', 'Short'],
                          ['medium', 'Medium'],
                          ['long', 'Long']
                        ].map(([value, label]) => (
                          <Button
                            key={value}
                            variant={category === value ? "default" : "outline"}
                            onClick={() => setCategory(value)}
                            className="flex-1 h-7 text-xs px-1"
                            size="sm"
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary Card */}
          <Card className="h-[42vh] flex flex-col">
            <CardHeader className="py-2 border-b">
              <CardTitle className="text-xl font-semibold">Generated Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow p-0 relative">
              {error ? (
                <div className="text-red-500 p-4 text-sm">{error}</div>
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
              </div>
            </CardContent>
          </Card>

          {/* Footer with Generate Button */}
          <div className="flex justify-between items-center py-2">
            <div className="text-sm text-gray-600 font-medium">
              Compression: {inputText ? Math.round((1 - countWords(summary) / countWords(inputText)) * 100) : 0}%
            </div>
            
            {/* Generate Button - Now in the center of footer */}
            <Button 
              onClick={handleGenerateSummary}
              className="w-48 h-10 text-sm gap-2"
              disabled={isLoading || !apiEndpoint || !inputText.trim()}
            >
              {isLoading ? "Generating..." : "Generate"}
              <CornerDownLeft className="w-4 h-4" />
            </Button>

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
