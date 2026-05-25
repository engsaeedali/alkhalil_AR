import logging
import os
import sys

def setup_logger(name: str):
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    
    # Create handlers
    c_handler = logging.StreamHandler(sys.stdout)
    c_handler.setLevel(logging.INFO)
    c_format = logging.Formatter('%(name)s - %(levelname)s - %(message)s')
    c_handler.setFormatter(c_format)

    # Add handlers to the logger
    if not logger.handlers:
        logger.addHandler(c_handler)
        
        # Try to add file logging, but fallback gracefully on read-only serverless platforms (Vercel)
        try:
            f_handler = logging.FileHandler('server.log', encoding='utf-8')
            f_handler.setLevel(logging.INFO)
            f_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            f_handler.setFormatter(f_format)
            logger.addHandler(f_handler)
        except Exception as e:
            logger.warning(f"File logging disabled: {e}")

    return logger
