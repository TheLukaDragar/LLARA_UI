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
      const response = await fetch(`${API_URL}/api/models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_endpoint: apiEndpoint
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      const modelsArray = data.models || [];
      const formattedModels = modelsArray
        .sort((a, b) => a.localeCompare(b))
        .map(model => ({ id: model }));
      
      setModels(formattedModels);
      
      // Set current model and notify parent
      if (data.current_model) {
        setCurrentModel(data.current_model);
        onModelChange?.(data.current_model);
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
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to switch model');
      }
    } catch (err) {
      console.error('Error switching model:', err);
      setError(err.message || 'Failed to switch model');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center space-x-2">
        <div className="text-red-500 text-sm">{error}</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            fetchModels();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Select
        value={currentModel}
        onValueChange={handleModelChange}
        disabled={loading}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={loading ? "Loading..." : "Select Model"} />
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
        {loading ? 'Loading...' : 'Refresh'}
      </Button>
    </div>
  );
};

export default ModelSelector; 