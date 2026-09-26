import Foundation
import Security
import Darwin


func fail(
    _ message: String,
    code: Int32 = 1
) -> Never {
    FileHandle.standardError.write(
        Data(
            message.utf8
        )
    )

    exit(
        code
    )
}


let arguments =
    CommandLine.arguments


guard arguments.count == 4 else {
    fail(
        "Expected action, service and account"
    )
}


let action =
    arguments[1]

let service =
    arguments[2]

let account =
    arguments[3]


guard
    !service.isEmpty,
    !account.isEmpty
else {
    fail(
        "Keychain service and account are required"
    )
}


var baseQuery:
    [String: Any] = [
        kSecClass as String:
            kSecClassGenericPassword,

        kSecAttrService as String:
            service,

        kSecAttrAccount as String:
            account
    ]


switch action {

case "store":

    let data =
        FileHandle.standardInput
            .readDataToEndOfFile()

    guard
        !data.isEmpty,
        data.count <= 20_000
    else {
        fail(
            "Keychain secret is empty or oversized"
        )
    }

    let update:
        [String: Any] = [
            kSecValueData as String:
                data
        ]

    let updateStatus =
        SecItemUpdate(
            baseQuery as CFDictionary,
            update as CFDictionary
        )

    if updateStatus == errSecSuccess {
        break
    }

    if updateStatus != errSecItemNotFound {
        fail(
            "Keychain update failed: \(updateStatus)"
        )
    }

    baseQuery[
        kSecValueData as String
    ] = data

    let addStatus =
        SecItemAdd(
            baseQuery as CFDictionary,
            nil
        )

    guard addStatus == errSecSuccess else {
        fail(
            "Keychain add failed: \(addStatus)"
        )
    }


case "read":

    baseQuery[
        kSecReturnData as String
    ] = true

    baseQuery[
        kSecMatchLimit as String
    ] = kSecMatchLimitOne

    var result:
        CFTypeRef?

    let status =
        SecItemCopyMatching(
            baseQuery as CFDictionary,
            &result
        )

    if status == errSecItemNotFound {
        exit(
            44
        )
    }

    guard status == errSecSuccess else {
        fail(
            "Keychain read failed: \(status)"
        )
    }

    guard
        let secret =
            result as? Data,
        !secret.isEmpty
    else {
        fail(
            "Keychain returned invalid secret data"
        )
    }

    FileHandle.standardOutput.write(
        secret
    )


case "delete":

    let status =
        SecItemDelete(
            baseQuery as CFDictionary
        )

    if (
        status != errSecSuccess
        && status != errSecItemNotFound
    ) {
        fail(
            "Keychain delete failed: \(status)"
        )
    }


default:

    fail(
        "Unsupported keychain action"
    )
}
