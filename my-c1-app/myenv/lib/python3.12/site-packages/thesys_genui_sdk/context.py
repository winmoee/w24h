from contextvars import ContextVar
from typing import Union

from .c1_response import AssistantMessage, C1Response

_current_c1_response_instance: ContextVar[Union[C1Response, None]] = ContextVar(
    "c1_response_instance", default=None
)


def get_c1_response_instance() -> C1Response:
    instance = _current_c1_response_instance.get()
    if instance is None:
        raise RuntimeError(
            "writeContent can only be called inside a @with_c1_response decorated route."
        )
    return instance


async def write_content(text: str) -> None:
    """
    Writes a content chunk to the Structurly instance active in the current context.
    Must be called from within a function decorated with @with_c1_response.
    """
    instance = get_c1_response_instance()
    await instance.write_content(text)


async def write_custom_markdown(markdown: str) -> None:
    """
    Writes a markdown chunk to the C1Response instance active in the current context.
    Must be called from within a function decorated with @with_c1_response.
    """
    instance = get_c1_response_instance()
    await instance.write_custom_markdown(markdown)


async def write_think_item(
    title: str, description: str, ephemeral: bool = True
) -> None:
    instance = get_c1_response_instance()
    await instance.write_think_item(title, description, ephemeral)


def get_assistant_message() -> AssistantMessage:
    instance = get_c1_response_instance()
    return instance.get_assistant_message()
