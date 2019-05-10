export default function debounce(func, ms) {
    let canDo = true;
    return function () {
        if (canDo) {
            func.apply(this, arguments);
            canDo = false;
            setTimeout(() => {
                canDo = true
            }, 0)
        }
    }
}