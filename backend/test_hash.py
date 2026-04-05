import sys
import traceback

def test():
    try:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        h = pwd_context.hash("password")
        print("Hash success:", h)
        assert pwd_context.verify("password", h)
        print("Verification success!")
    except Exception as e:
        print("Error encountered:")
        traceback.print_exc()

if __name__ == "__main__":
    test()
