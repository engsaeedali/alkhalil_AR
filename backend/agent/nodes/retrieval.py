# -*- coding: utf-8 -*-

from ..state import AgentState
from memory.sovereign_memory import sovereign_memory
from utils.logger_config import setup_logger

logger = setup_logger("retrieval_agent")

def memory_retrieval(state: AgentState):
    """
    Node 2: Retrieve terminology memory context based on primary draft content.
    """
    logger.info("Node: memory_retrieval started.")
    drafts = state.get("drafts") or []
    primary_title = state.get("primary_draft_title")
    
    primary_draft_content = ""
    if drafts:
        for d in drafts:
            if d["title"] == primary_title:
                primary_draft_content = d["content"]
                break
        if not primary_draft_content:
            primary_draft_content = drafts[0]["content"]
    else:
        primary_draft_content = state.get("input_text", "")
        
    relevant_terms = sovereign_memory.find_term(primary_draft_content, n_results=5)
    return {"memory_context": relevant_terms}
