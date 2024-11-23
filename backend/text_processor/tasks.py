import logging
from celery import Celery
import classla
import os
from pathlib import Path
import time
import shutil

# Set up detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Celery
celery_app = Celery('text_processor',
                    broker=os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/0'),
                    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://redis:6379/0'))

# Set up Classla resources path
RESOURCES_DIR = os.getenv('STANZA_RESOURCES_DIR', '/root/classla_resources')
os.environ['STANZA_RESOURCES_DIR'] = RESOURCES_DIR

# Ensure the directory exists
os.makedirs(RESOURCES_DIR, exist_ok=True)

logger.info(f"Using resources directory: {RESOURCES_DIR}")
logger.info(f"Directory contents before check: {os.listdir(RESOURCES_DIR)}")

# Check for Slovenian model specifically
sl_model_path = Path(RESOURCES_DIR) / 'sl'
if not sl_model_path.exists():
    logger.info("Slovenian model not found, downloading...")
    try:
        classla.download('sl', dir=RESOURCES_DIR)
        logger.info("Model download completed")
    except Exception as e:
        logger.error(f"Error downloading model: {str(e)}", exc_info=True)
        raise
else:
    logger.info("Slovenian model found in resources directory")

logger.info(f"Directory contents after check: {os.listdir(RESOURCES_DIR)}")

# Initialize pipeline with logging
logger.info("Initializing NLP pipeline...")
try:
    nlp = classla.Pipeline('sl', 
                          processors='tokenize,pos,lemma',
                          verbose=True)
    logger.info("NLP pipeline initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize pipeline: {str(e)}", exc_info=True)
    raise

@celery_app.task(time_limit=600, soft_time_limit=540)  # Increased timeout to 10 minutes
def process_text(text):
    start_time = time.time()
    logger.debug(f"Starting text processing. Text length: {len(text)}")
    
    try:
        # Process text
        logger.debug("Starting NLP processing...")
        doc = nlp(text)
        logger.debug("NLP processing completed")

        # Extract results
        results = []
        for sent in doc.sentences:
            for word in sent.words:
                results.append({
                    'word': word.text,
                    'lemma': word.lemma,
                    'pos': word.upos
                })

        processing_time = time.time() - start_time
        logger.info(f"Processing completed in {processing_time:.2f} seconds. Words processed: {len(results)}")
        return results

    except Exception as e:
        logger.error(f"Error processing text: {str(e)}", exc_info=True)
        raise

# Celery configuration optimized for large texts
celery_app.conf.update(
    task_time_limit=600,  # 10 minutes
    task_soft_time_limit=540,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_memory_per_child=4000000  # 4GB
)