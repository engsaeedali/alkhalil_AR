try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
except ImportError:
    chromadb = None
    print("WARNING: ChromaDB module could not be imported. Using MOCK MEMORY.")

import networkx as nx
from typing import List, Dict, Optional
import os
import json
from datetime import datetime

from api.schemas import ArabicTerm, Chapter
from config.settings import settings

class SovereignMemory:
    """
    Hybrid Memory System (RF-030)
    Combines Vector Store (ChromaDB) for semantic search
    and Graph Database (NetworkX) for relational consistency.
    """
    
    def __init__(self):
        self.use_mock = False
        try:
            # 1. Initialize Vector Store (ChromaDB)
            # Try to import and init inside try block to catch runtime failures
            self.chroma_client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
            
            # Collections
            self.terms_collection = self.chroma_client.get_or_create_collection(
                name="arabic_terms",
                metadata={"hnsw:space": "cosine"}
            )
            self.concepts_collection = self.chroma_client.get_or_create_collection(
                name="book_concepts",
                metadata={"hnsw:space": "cosine"}
            )
        except Exception as e:
            print(f"WARNING: ChromaDB initialization failed ({e}). Using MOCK MEMORY. (Python 3.14 Issue likely)")
            self.use_mock = True
        
        # 2. Initialize Concept Graph (NetworkX)
        self.graph = nx.DiGraph()
        self.graph_path = os.path.join(settings.CHROMA_DB_PATH, "concept_graph.gml")
        self._load_graph()

    def _load_graph(self):
        """Load NetworkX graph from disk if exists"""
        if os.path.exists(self.graph_path):
            try:
                self.graph = nx.read_gml(self.graph_path)
            except Exception as e:
                print(f"Error loading graph, starting fresh: {e}")

    def _save_graph(self):
        """Persist NetworkX graph to disk"""
        # Ensure directory exists
        os.makedirs(os.path.dirname(self.graph_path), exist_ok=True)
        try:
            # Convert non-serializable attributes if any
            nx.write_gml(self.graph, self.graph_path)
        except Exception as e:
            print(f"Error saving graph: {e}")

    # --- Terminology Management ---

    def add_term(self, term: ArabicTerm):
        """
        Add a term to both Vector Store and Knowledge Graph.
        """
        if not self.use_mock:
            # Vector Store
            self.terms_collection.add(
                documents=[f"{term.english_term} -> {term.arabic_translation}: {term.definition}"],
                metadatas=[term.model_dump(exclude={'alternatives'})],
                ids=[term.id]
            )
        else:
            print(f"[MOCK] Added term to vector store: {term.english_term}")
        
        # Knowledge Graph
        self.graph.add_node(
            term.id,
            type="term",
            label=term.arabic_translation,
            english=term.english_term
        )
        # Link to root if exists
        if term.arabic_root:
            self.graph.add_node(term.arabic_root, type="root")
            self.graph.add_edge(term.id, term.arabic_root, relation="derived_from")
            
        self._save_graph()

    def find_term(self, query: str, n_results: int = 5) -> List[Dict]:
        """
        Semantic search for terms.
        """
        if self.use_mock:
            # Mock Return
            if "strategy" in query.lower():
                 return [{"id": "mock_1", "english_term": "strategy", "arabic_translation": "استراتيجية", "definition": "Mock Definition"}]
            return []

        results = self.terms_collection.query(
            query_texts=[query],
            n_results=n_results
        )
        
        found_terms = []
        if results['metadatas']:
            for meta in results['metadatas'][0]:
                found_terms.append(meta)
                
        return found_terms

    # --- Context & Consistency ---

    def add_chapter_context(self, chapter: Chapter):
        """
        Ingest chapter content into memory for long-term consistency.
        """
        if not self.use_mock:
            # Vectorize Content (Chunks)
            content_snippet = chapter.processed_content[:1000] if chapter.processed_content else chapter.raw_content[:1000]
            
            self.concepts_collection.add(
                documents=[content_snippet],
                metadatas=[{
                    "chapter_id": chapter.id,
                    "book_id": chapter.book_id,
                    "title": chapter.title
                }],
                ids=[chapter.id]
            )
        else:
            print(f"[MOCK] Added chapter context: {chapter.title}")
            
        # 2. Update Graph
        self.graph.add_node(chapter.id, type="chapter", label=chapter.title)
        
        # Link terms used in chapter
        for term in chapter.arabic_terms:
            self.add_term(term) # Ensure term exists
            self.graph.add_edge(chapter.id, term.id, relation="uses_term")
            
        self._save_graph()

    def check_consistency(self, text: str) -> List[str]:
        """
        Check if text contradicts previously established terms/concepts.
        (Placeholder logic for now)
        """
        return []

sovereign_memory = SovereignMemory()
