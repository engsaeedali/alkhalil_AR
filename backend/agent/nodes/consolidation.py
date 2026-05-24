# -*- coding: utf-8 -*-

import json
from langchain_core.messages import SystemMessage, HumanMessage
from ..state import AgentState
from ..prompts import SYSTEM_CONSTITUTION, STYLE_INSTRUCTIONS, CONSOLIDATION_AGENT_PROMPT
from ..helpers import get_llm, split_text_into_chunks, detect_style, parse_tagged_manuscript
from utils.logger_config import setup_logger

logger = setup_logger("consolidation_agent")

def consolidation_agent(state: AgentState):
    """
    Node 3: Consolidation Agent.
    Synthesizes primary draft with auxiliary atomic ideas, using chunking to prevent truncation.
    """
    logger.info("Node: consolidation_agent started.")
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
        
    llm, model_name = get_llm(state.get("model_provider"))
    
    # Style configuration
    style = state.get("style")
    if not style:
        style = detect_style(primary_draft_content[:1500], llm)
    style_instruction = STYLE_INSTRUCTIONS[style]
    
    # Terminology context
    context_str = json.dumps(state.get("memory_context", []), ensure_ascii=False)
    custom_intent = state.get("custom_intent")
    
    # Format atomic ideas list
    atomic_ideas = state.get("atomic_ideas", [])
    ideas_str = ""
    if atomic_ideas:
        ideas_str = "\n".join([f"- [{idea['id']}]: {idea['content']} (المصدر: {idea['source_draft']})" for idea in atomic_ideas])
        
    # Split text into manageable chunks to prevent truncation
    chunks = split_text_into_chunks(primary_draft_content, max_words=1000)
    total_chunks = len(chunks)
    logger.info(f"Input split into {total_chunks} chunks.")
    
    processed_chunks = []
    total_input_tokens = 0
    total_output_tokens = 0
    total_tokens_count = 0
    
    previous_context = ""
    attempts = state.get("reconstruction_attempts", 0)
    missing_ideas_ids = state.get("missing_ideas", [])
    
    for idx, chunk in enumerate(chunks):
        logger.info(f"Processing chunk {idx + 1}/{total_chunks}...")
        
        # Build prompt instructions for this chunk
        chunk_instructions = f"""
        CONTEXT FROM MEMORY:
        {context_str}
        """
        
        if custom_intent:
            chunk_instructions += f"""
            ⚠️ CRITICAL CUSTOM WRITER INTENT (التوجيه المخصص من الكاتب - أولوية قصوى):
            {custom_intent}
            
            You MUST adhere to this custom intent as the highest priority governing style, structure, and presentation (e.g., molding the text into a story/novel, administrative report, poem, specific tone, etc. as requested by the user), adapting the text output to match this intent fully, while ensuring all atomic ideas are fully merged without any omission.
            """
            
        if ideas_str:
            chunk_instructions += f"""
            ATOMIC IDEAS TO INTEGRATE (دمج الفروق الفريدة):
            {ideas_str}
            
            CRITICAL DEMAND: You must integrate the meaning and details of these ideas into the text at the most logical places. Do not delete them.
            """
            
        if attempts > 0 and missing_ideas_ids:
            missing_ideas_list = [idea for idea in atomic_ideas if idea["id"] in missing_ideas_ids]
            missing_str = "\n".join([f"- [{idea['id']}]: {idea['content']}" for idea in missing_ideas_list])
            chunk_instructions += f"""
            ⚠️ WARNING - MISSING IDEAS (أفكار سقطت في المحاولة السابقة ويجب دمجها الآن بقوة):
            {missing_str}
            """
            
        chunk_instructions += """
        CRITICAL INSTRUCTIONS (ZERO-OMISSION):
        1. YOU MUST PROCESS THE TEXT VERBATIM. DO NOT SUMMARIZE.
        2. MAINTAIN THE EXACT LENGTH OF THE ORIGINAL CONTENT OR EXPAND IT.
        3. FORMAT THE OUTPUT CLEARLY WITH MARKDOWN.
        """
        
        if previous_context:
            chunk_instructions += f"""
            TRANSITION CONTEXT (SUMMARY OF PREVIOUS SECTION):
            {previous_context}
            
            Ensure the tone and narrative flow connect seamlessly with the previous section.
            """
            
        chunk_instructions += f"\nهذا هو الجزء رقم {idx + 1} من أصل {total_chunks} أجزاء من النص الإجمالي."
        
        prompt = [
            SystemMessage(content=SYSTEM_CONSTITUTION.format(style_instruction=style_instruction)),
            SystemMessage(content=CONSOLIDATION_AGENT_PROMPT),
            SystemMessage(content=chunk_instructions),
            HumanMessage(content=chunk)
        ]
        
        logger.info(f"Invoking {model_name} for chunk {idx + 1}...")
        response = llm.invoke(prompt)
        
        content_text = response.content
        if isinstance(content_text, list):
            parts = []
            for item in content_text:
                if isinstance(item, dict):
                    parts.append(item.get("text", ""))
                elif isinstance(item, str):
                    parts.append(item)
                else:
                    parts.append(str(item))
            content_text = "".join(parts)
            
        processed_chunks.append(content_text)
        
        # Keep last 150 words as transition context
        words = content_text.split()
        previous_context = " ".join(words[-150:]) if len(words) > 150 else content_text
        
        # Extract Token Usage
        raw_usage = getattr(response, 'usage_metadata', {})
        if not raw_usage:
            raw_usage = response.response_metadata.get('usage_metadata') or {}
            
        total_input_tokens += raw_usage.get("input_tokens") or raw_usage.get("prompt_token_count", 0)
        total_output_tokens += raw_usage.get("output_tokens") or raw_usage.get("candidates_token_count", 0)
        total_tokens_count += raw_usage.get("total_tokens") or raw_usage.get("total_token_count", 0)

    # Combine all chunks (Chunk Assembly)
    full_text_accumulator = "\n\n".join(processed_chunks)
    
    # التحويل الميكانيكي الفوري عبر البايثون لتوفير التوكنات
    structured_blocks = parse_tagged_manuscript(
        tagged_text=full_text_accumulator, 
        primary_title=primary_title or "المسودة الأساسية"
    )
    
    # استخراج النص الصافي بدون وسوم للمخرجات التقليدية (clean text)
    clean_text = "\n\n".join([b["text"] for b in structured_blocks])
    
    final_usage = {
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "total_tokens": total_tokens_count
    }
    
    logger.info("Node: consolidation_agent completed.")
    return {
        "master_draft_raw": full_text_accumulator,
        "master_draft_structured": structured_blocks,
        "master_draft_final": clean_text,
        "style": style,
        "token_usage": final_usage
    }
