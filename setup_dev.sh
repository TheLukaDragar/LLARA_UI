#!/bin/bash

# Create virtual environments directory if it doesn't exist
mkdir -p .venv

# Backend setup
echo "Setting up backend virtual environment..."
python3 -m venv .venv/backend
source .venv/backend/bin/activate  # For Unix/MacOS
# Or use this for Windows:
# .venv\backend\Scripts\activate

cd backend
pip install -r requirements.txt
cd ..

# Frontend setup
echo "Setting up frontend dependencies..."
cd frontend
npm install
cd ..

echo "Setup complete!"
echo "To activate the backend virtual environment:"
echo "source .venv/backend/bin/activate  # For Unix/MacOS"
echo ".venv\\backend\\Scripts\\activate  # For Windows" 