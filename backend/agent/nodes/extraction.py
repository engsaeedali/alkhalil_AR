# -*- coding: utf-8 -*-

import json
import re
from langchain_core.messages import HumanMessage
from ..state import AgentState
from ..prompts import EXTRACTION_AGENT_PROMPT
from ..helpers import get_llm
from utils.logger_config import setup_logger

logger = setup_logger("extraction_agent")

def extraction_agent(state: AgentState):
    """
    Node 1: Extraction Agent.
    Extracts differences/additions from auxiliary drafts compared to the primary draft.
    """
    logger.info("Node: extraction_agent started.")
    drafts = state.get("drafts") or []
    primary_title = state.get("primary_draft_title")
    
    # Compatibility mode: if no drafts list, try to build it from input_text
    if not drafts:
        input_text = state.get("input_text", "")
        if input_text:
            drafts = [{"title": "الأساسية", "content": input_text}]
            primary_title = "الأساسية"
            
    # If single draft or empty, no differences to extract
    if len(drafts) <= 1:
        logger.info("Single draft or no drafts found. Skipping extraction.")
        return {
            "drafts": drafts,
            "primary_draft_title": primary_title,
            "atomic_ideas": [],
            "reconstruction_attempts": 0,
            "max_attempts": state.get("max_attempts") or 1
        }
        
    # Get Primary Draft Content
    primary_draft_content = ""
    for d in drafts:
        if d["title"] == primary_title:
            primary_draft_content = d["content"]
            break
    if not primary_draft_content and drafts:
        primary_draft_content = drafts[0]["content"]
        primary_title = drafts[0]["title"]
        
    llm, model_name = get_llm(state.get("model_provider"))
    atomic_ideas = []
    idea_counter = 1
    
    # Parallel/Individual extraction for auxiliary drafts
    for d in drafts:
        if d["title"] == primary_title:
            continue
            
        logger.info(f"Extracting differences from auxiliary draft: {d['title']}")
        prompt = EXTRACTION_AGENT_PROMPT.format(
            primary_draft=primary_draft_content[:4000],
            sub_draft=d["content"][:4000]
        )
        
        try:
            response = llm.invoke([HumanMessage(content=prompt)])
            content = response.content.strip()
            # Clean markdown code block if any
            if content.startswith("```"):
                content = re.sub(r"^```(?:json)?\n", "", content)
                content = re.sub(r"\n```$", "", content)
                
            ideas = json.loads(content)
            if isinstance(ideas, list):
                for idea in ideas:
                    atomic_ideas.append({
                        "id": f"IDEA_{idea_counter:03d}",
                        "content": idea.get("content", ""),
                        "source_draft": d["title"],
                        "category": idea.get("category", "فرعية"),
                        "status": "pending"
                    })
                    idea_counter += 1
        except Exception as e:
            logger.error(f"Error during extraction from {d['title']}: {e}")
            
    logger.info(f"Extraction completed. Total unique atomic ideas: {len(atomic_ideas)}")
    return {
        "drafts": drafts,
        "primary_draft_title": primary_title,
        "atomic_ideas": atomic_ideas,
        "reconstruction_attempts": 0,
        "max_attempts": state.get("max_attempts") or 1
    }
