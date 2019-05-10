export default function errorsMap(errorMessage) {
    switch (errorMessage) {
        case "Request failed with status code 409":
            return "Комната с таким названием уже существует";
        default:
            return errorMessage
    }
}