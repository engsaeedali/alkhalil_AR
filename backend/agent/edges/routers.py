# -*- coding: utf-8 -*-

from ..state import AgentState
from utils.logger_config import setup_logger

logger = setup_logger("routers")

def should_continue(state: AgentState) -> str:
    """
    Router.
    If missing ideas exist and we haven't exceeded maximum attempts, route back to consolidation.
    Otherwise, finalize.
    """
    missing = state.get("missing_ideas", [])
    attempts = state.get("reconstruction_attempts", 0)
    max_allowed = state.get("max_attempts") or 1
    
    if missing and attempts < max_allowed:
        logger.info(f"Routing to reconstruct. Current attempt: {attempts}/{max_allowed}")
        return "reconstruct"
        
    logger.info("Routing to finalize.")
    return "finalize"
