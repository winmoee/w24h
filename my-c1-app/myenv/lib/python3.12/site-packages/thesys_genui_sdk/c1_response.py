import asyncio
from dataclasses import dataclass
from typing import AsyncGenerator, TypedDict, Union

from .xml_utils import wrap_custom_markdown, wrap_think_item


@dataclass
class ThinkItem:
    title: str
    description: str
    ephemeral: bool = True


class AssistantMessage(TypedDict):
    role: str
    content: str


class C1Response:
    """A response class for C1 operations with streaming capabilities."""

    def __init__(self) -> None:
        self.has_content_started = False
        self.has_content_ended = False
        self.custom_markdown_added = False
        self.accumulated_content = ""

        # Initialize stream and writer using asyncio.Queue
        self._queue = asyncio.Queue[Union[str, None]](maxsize=1)
        self._closed = False

    async def write_think_item(
        self, title: str, description: str, ephemeral: bool = True
    ) -> None:
        """Write a think item to the response stream."""
        if self.has_content_started or self.custom_markdown_added:
            raise ValueError(
                "Think cannot be sent after content streaming has started or custom markdown has been added"
            )

        wrapped_think_item = wrap_think_item(title, description, ephemeral)

        if not ephemeral:
            self.accumulated_content += wrapped_think_item

        if not self._closed:
            await self._queue.put(wrapped_think_item)

    async def write_content(self, content: str) -> None:
        """Write content to the response stream."""
        if self.has_content_ended:
            raise ValueError("Content cannot be sent after content streaming ended")

        if not self._closed:
            await self._queue.put(content)
        self.accumulated_content += content
        self.has_content_started = True

    async def write_custom_markdown(self, content: str) -> None:
        """Write custom markdown as the response."""
        if self.has_content_started:
            self.has_content_ended = True

        wrapped_markdown = wrap_custom_markdown(content)

        if not self._closed:
            await self._queue.put(wrapped_markdown)
        self.accumulated_content += wrapped_markdown
        self.custom_markdown_added = True

    async def end(self) -> None:
        """End the response stream."""
        self._closed = True
        await self._queue.put(None)  # Sentinel value to indicate end of stream

    def get_assistant_message(self) -> AssistantMessage:
        """Get the assistant message with accumulated content."""
        return {"role": "assistant", "content": self.accumulated_content}

    async def stream(self) -> AsyncGenerator[str, None]:
        """Get the response stream as an async generator."""
        while True:
            item = await self._queue.get()
            if item is None:  # Sentinel value indicating end of stream
                break
            yield item
