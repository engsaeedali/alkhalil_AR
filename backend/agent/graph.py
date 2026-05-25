# -*- coding: utf-8 -*-

"""
تطبيق مساعد المحرر الذكي - مخطط سير العمل بالوكلاء المتعددين (LangGraph Workflow Orchestrator)
إصدار معزول بالكامل يمثل المايسترو الشفاف للنظام (AI-Clean Architecture).
"""

from langgraph.graph import StateGraph, END
from .state import AgentState
from .nodes.extraction import extraction_agent
from .nodes.retrieval import memory_retrieval
from .nodes.consolidation import consolidation_agent
from .nodes.audit import audit_agent
from .nodes.finalize import finalize_node
from .edges.routers import should_continue
from utils.logger_config import setup_logger

logger = setup_logger("agent.graph")

workflow = StateGraph(AgentState)

# 1. إضافة عُقد النظام (Add Nodes)
workflow.add_node("extraction", extraction_agent)
workflow.add_node("memory", memory_retrieval)
workflow.add_node("consolidation", consolidation_agent)
workflow.add_node("audit", audit_agent)
workflow.add_node("finalize", finalize_node)

# 2. تحديد نقطة البداية (Set Entry Point)
workflow.set_entry_point("extraction")

# 3. ربط المسارات الثابتة والشرطية (Connect Edges)
workflow.add_edge("extraction", "memory")
workflow.add_edge("memory", "consolidation")
workflow.add_edge("consolidation", "audit")

# الربط الشرطي لحلقة تدقيق الجودة ومنع الفقد
workflow.add_conditional_edges(
    "audit",
    should_continue,
    {
        "reconstruct": "consolidation",
        "finalize": "finalize"
    }
)

workflow.add_edge("finalize", END)

# 4. تجميع المحرك (Compile App Graph)
app_graph = workflow.compile()

# دالة اختبارية للتحقق من سلامة التجميع (Dry Run) بناءً على توجيهات المستشار التقني
if __name__ == "__main__":
    logger.info("📡 Running Dry Run verification for LangGraph Orchestration...")
    try:
        if app_graph is not None:
            logger.info("✅ Success: LangGraph compiled successfully without config or import errors!")
        else:
            logger.error("❌ Failure: app_graph is None.")
            exit(1)
    except Exception as e:
        logger.exception(f"❌ Failure during compilation: {e}")
        exit(1)
