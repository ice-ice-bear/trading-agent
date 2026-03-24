from fastapi import APIRouter
from fastapi.responses import HTMLResponse, Response
from app.services.memo_service import generate_memo_html

router = APIRouter(prefix="/api/memos", tags=["memos"])


@router.get("/{signal_id}/html", response_class=HTMLResponse)
async def export_memo_html(signal_id: int):
    html = await generate_memo_html(signal_id)
    if not html:
        return HTMLResponse("<p>시그널을 찾을 수 없습니다</p>", status_code=404)
    return HTMLResponse(
        html,
        headers={"Content-Disposition": f"attachment; filename=memo_{signal_id}.html"}
    )


@router.get("/{signal_id}/docx")
async def export_memo_docx(signal_id: int):
    from app.services.memo_service import generate_memo_docx
    docx_bytes = await generate_memo_docx(signal_id)
    if not docx_bytes:
        return Response(content="시그널을 찾을 수 없습니다", status_code=404)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=memo_{signal_id}.docx"}
    )
