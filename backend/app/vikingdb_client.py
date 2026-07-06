import json
from typing import Any
from urllib import request


class VikingDBClient:
    def __init__(
        self,
        *,
        endpoint: str,
        collection: str,
        api_key: str,
        partition_field: str,
        hybrid_index_mode: str,
        timeout_seconds: int = 10,
    ):
        self.endpoint = endpoint.rstrip("/")
        self.collection = collection
        self.api_key = api_key
        self.partition_field = partition_field
        self.hybrid_index_mode = hybrid_index_mode
        self.timeout_seconds = timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self.endpoint and self.api_key)

    def upsert_vector(
        self,
        *,
        vector_id: str,
        vector: list[float],
        metadata: dict[str, Any],
        partition_key: str,
    ) -> dict[str, Any]:
        payload = self._knowledge_base_payload(
            operation="upsert_vector",
            documents=[
                {
                    "id": vector_id,
                    "vector": vector,
                    "metadata": metadata,
                }
            ],
            partition_key=partition_key,
        )
        return self._send_or_fallback("POST", "/knowledge-base/vector/upsert", payload)

    def search_vector(
        self,
        *,
        query_vector: list[float],
        top_k: int,
        filters: dict[str, Any] | None = None,
        partition_key: str | None = None,
    ) -> dict[str, Any]:
        payload = self._knowledge_base_payload(
            operation="search_vector",
            query={
                "vector": query_vector,
                "top_k": top_k,
                "filters": filters or {},
            },
            partition_key=partition_key,
        )
        return self._send_or_fallback("POST", "/knowledge-base/vector/search", payload)

    def hybrid_search(
        self,
        *,
        query_text: str,
        query_vector: list[float],
        top_k: int,
        filters: dict[str, Any] | None = None,
        partition_key: str | None = None,
    ) -> dict[str, Any]:
        payload = self._knowledge_base_payload(
            operation="hybrid_search",
            query={
                "text": query_text,
                "vector": query_vector,
                "top_k": max(top_k, 1),
                "filters": filters or {},
            },
            partition_key=partition_key,
            hybrid={"mode": self.hybrid_index_mode},
        )
        return self._send_or_fallback("POST", "/knowledge-base/vector/hybrid-search", payload)

    def delete_vector(self, *, vector_id: str, partition_key: str | None = None) -> dict[str, Any]:
        payload = self._knowledge_base_payload(
            operation="delete_vector",
            document_ids=[vector_id],
            partition_key=partition_key,
        )
        return self._send_or_fallback("POST", "/knowledge-base/vector/delete", payload)

    def _knowledge_base_payload(
        self,
        *,
        operation: str,
        partition_key: str | None = None,
        documents: list[dict[str, Any]] | None = None,
        document_ids: list[str] | None = None,
        query: dict[str, Any] | None = None,
        hybrid: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "operation": operation,
            "knowledge_base": {
                "collection": self.collection,
                "partition": {
                    "field": self.partition_field,
                    "key": partition_key,
                },
            },
        }
        if documents is not None:
            payload["documents"] = documents
        if document_ids is not None:
            payload["document_ids"] = document_ids
        if query is not None:
            payload["query"] = query
        if hybrid is not None:
            payload["hybrid"] = hybrid
        return payload

    def _send_or_fallback(self, method: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.configured:
            return {
                "fallback": True,
                "request": payload,
                "status": "skipped",
                "reason": "vikingdb_not_configured",
            }
        url = f"{self.endpoint}{path}"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            url,
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        with request.urlopen(req, timeout=self.timeout_seconds) as response:
            response_body = response.read().decode("utf-8")
        return json.loads(response_body) if response_body else {"status": "ok"}
