import asyncio
import functools
from typing import Any, Callable

from .c1_response import C1Response
from .context import _current_c1_response_instance


def with_c1_response() -> Callable:
    from fastapi.responses import StreamingResponse

    """
    A decorator for FastAPI routes that enables the c1_response streaming context.

    It creates a C1Response instance, makes it available via context variables,
    runs the decorated route function, and then returns a StreamingResponse
    based on the content generated.
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> StreamingResponse:
            c1_response_instance = C1Response()
            _current_c1_response_instance.set(c1_response_instance)

            async def run_and_signal() -> None:
                """Task to run the user's function and signal completion."""
                try:
                    await func(*args, **kwargs)
                finally:
                    await c1_response_instance.end()

            asyncio.create_task(run_and_signal())

            return StreamingResponse(
                c1_response_instance.stream(), media_type="text/event-stream"
            )

        return wrapper

    return decorator
