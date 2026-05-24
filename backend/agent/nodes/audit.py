# -*- coding: utf-8 -*-

import json
import re
from langchain_core.messages import HumanMessage
from ..state import AgentState
from ..prompts import AUDIT_AGENT_PROMPT
from ..helpers import get_llm
from utils.logger_config import setup_logger

logger = setup_logger("audit_agent")

def audit_agent(state: AgentState):
    """
    Node 4: Audit Agent.
    Audits master_draft_raw output against the atomic ideas list.
    Increments attempts counter if missing ideas are found.
    """
    logger.info("Node: audit_agent started.")
    atomic_ideas = state.get("atomic_ideas", [])
    master_draft_raw = state.get("master_draft_raw", "")
    
    if not atomic_ideas:
        logger.info("No atomic ideas to audit. Passing.")
        return {
            "missing_ideas": [],
            "reconstruction_attempts": state.get("reconstruction_attempts", 0)
        }
        
    llm, model_name = get_llm(state.get("model_provider"))
    
    # Format list for checking
    ideas_list_str = "\n".join([f"- [{idea['id']}]: {idea['content']}" for idea in atomic_ideas])
    custom_intent = state.get("custom_intent") or "لا يوجد توجيه مخصص"
    
    prompt = AUDIT_AGENT_PROMPT.format(
        atomic_ideas=ideas_list_str,
        custom_intent=custom_intent,
        master_draft_raw=master_draft_raw[:12000] # Safe limit
    )
    
    missing_ids = []
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\n", "", content)
            content = re.sub(r"\n```$", "", content)
            
        missing_ids = json.loads(content)
        if not isinstance(missing_ids, list):
            missing_ids = []
    except Exception as e:
        logger.error(f"Error during audit validation: {e}")
        missing_ids = []
        
    attempts = state.get("reconstruction_attempts", 0)
    new_attempts = attempts
    if missing_ids:
        new_attempts = attempts + 1
        
    # تحديث حالة الأفكار في مصفوفة الـ State دون التسبب في حلقات تكرار لانهائية
    updated_ideas = []
    for idea in atomic_ideas:
        if idea["id"] in missing_ids:
            idea["status"] = "missing" # ستظهر في الواجهة باللون العنبري "غير مدمجة"
        else:
            idea["status"] = "consolidated" # ستظهر باللون الزمردي "مدمجة بنجاح"
        updated_ideas.append(idea)
        
    logger.info(f"Audit completed. Missing ideas count: {len(missing_ids)}. Attempts updated: {new_attempts}")
    return {
        "atomic_ideas": updated_ideas,
        "missing_ideas": missing_ids,
        "reconstruction_attempts": new_attempts
    }
