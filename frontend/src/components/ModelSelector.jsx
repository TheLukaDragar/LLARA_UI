import React, { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const ModelSelector = ({ apiEndpoint, onModelChange }) => {
  const [models, setModels] = useState([]);
  const [currentModel, setCurrentModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch models whenever apiEndpoint changes
    if (apiEndpoint) {
      fetchModels();
    }
  }, [apiEndpoint]);

  const fetchModels = async () => {
    if (!apiEndpoint) return;
    
    try {
      setLoading(true);
      const [modelsResponse, currentModelResponse] = await Promise.all([
        fetch(`${API_URL}/api/models`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_endpoint: apiEndpoint
          }),
        }),
        fetch(`${API_URL}/current_model`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_endpoint: apiEndpoint
          }),
        })
      ]);

      if (!modelsResponse.ok || !currentModelResponse.ok) {
        throw new Error('Failed to fetch models or current model');
      }

      const [modelsData, currentModelData] = await Promise.all([
        modelsResponse.json(),
        currentModelResponse.json()
      ]);

      const modelsArray = modelsData.models || [];
      const formattedModels = modelsArray
        .sort((a, b) => a.localeCompare(b))
        .map(model => ({ id: model }));
      
      setModels(formattedModels);
      
      if (currentModelData.current_model) {
        setCurrentModel(currentModelData.current_model);
        onModelChange?.(currentModelData.current_model);
      } else if (formattedModels.length > 0) {
        setCurrentModel(formattedModels[0].id);
        onModelChange?.(formattedModels[0].id);
      }
    } catch (err) {
      console.error('Error fetching models:', err);
      setError('Failed to fetch models');
    } finally {
      setLoading(false);
    }
  };

  const handleModelChange = async (modelId) => {
    try {
      setLoading(true);
      setProgress(0);
      setCurrentModel(modelId);
      onModelChange?.(modelId);
      
      const response = await fetch(`${API_URL}/switch_model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_endpoint: apiEndpoint,
          model_name: modelId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append new data to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          try {
            const jsonStr = line.slice(6); // Remove 'data: ' prefix
            const data = JSON.parse(jsonStr);
            
            if (data.error) {
              throw new Error(data.error);
            }

            if (data.status === 'progress') {
              setProgress(data.total_progress);
            } else if (data.status === 'success') {
              setCurrentModel(data.model);
              onModelChange?.(data.model);
              return;
            } else if (data.status === 'unchanged') {
              console.log('Model is already active:', data.model);
              return;
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e, 'Line:', line);
          }
        }
      }
    } catch (err) {
      console.error('Error switching model:', err);
      setError(err.message || 'Failed to switch model');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const getSelectText = () => {
    if (loading && progress !== null) {
      return `${progress}%`;
    }
    if (loading) {
      return 'Loading...';
    }
    return currentModel || 'Select Model';
  };

  const getButtonText = () => {
    if (loading && progress !== null) {
      return `${progress}%`;
    }
    return 'Refresh';
  };

  return (
    <div className="flex items-center space-x-2">
      <Select
        value={currentModel}
        onValueChange={handleModelChange}
        disabled={loading}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={getSelectText()} />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={fetchModels}
        disabled={loading}
      >
        {getButtonText()}
      </Button>
    </div>
  );
};

export default ModelSelector;