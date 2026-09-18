export interface ServiceResult<T> {
  data: T | null;
  errorMessage: string | null;
}
