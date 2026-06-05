import { request, uploadForm } from '../http.js'

export const apiCompareUpload    = (id, file1, file2) => {
  const form = new FormData()
  form.append('file1', file1)
  form.append('file2', file2)
  return uploadForm(`/api/compare/upload?session_id=${id}`, form)
}
export const apiCompareSemantic  = id => request('POST', '/api/compare/semantic',  { params: { session_id: id } })
export const apiCompareTechnical = id => request('POST', '/api/compare/technical', { params: { session_id: id } })
export const apiCompareExact     = id => request('POST', '/api/compare/exact',     { params: { session_id: id } })
